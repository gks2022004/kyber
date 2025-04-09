const { Server: SocketIOServer } = require("socket.io");

const io = new SocketIOServer({
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.listen(3001);

const users = {};

setInterval(() => {
  console.log(`Active connections: ${io.sockets.sockets.size}, Registered users: ${Object.keys(users).length}`);
  console.log('Registered users:', Object.keys(users));
}, 30000);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  let currentUser = null;

  socket.emit('welcome', { message: 'Connected to ML-KEM Secure Chat server' });

  socket.on('join', ({ username, identityKey, kemKey }) => {
    if (users[username] && users[username].id !== socket.id) {
      socket.emit('error', { message: 'Username already taken' });
      return;
    }
    
    currentUser = username;
    users[username] = {
      id: socket.id,
      username,
      identityKey,
      kemKey,
      joinedAt: new Date().toISOString()
    };

    socket.join(username);
    io.emit('users', Object.values(users));
    socket.broadcast.emit('user_joined', { username, identityKey, kemKey });
    socket.emit('joined', { 
      success: true, 
      username,
      users: Object.values(users).filter(u => u.username !== username)
    });
  });

  socket.on('request_users', () => {
    socket.emit('users', Object.values(users));
  });

  socket.on('get_user_info', ({ username }, callback) => {
    const requestedUser = users[username];
    if (requestedUser) {
      if (typeof callback === 'function') {
        callback(requestedUser);
      }
      socket.emit(`user_info_${username}`, requestedUser);
    } else {
      socket.emit('error', { message: `User ${username} not found` });
    }
  });

  socket.on('key_exchange', (data, callback) => {
    console.log(`Key exchange from ${data.from} to ${data.to}`);
    
    if (!users[data.from] || !users[data.to]) {
      const errorMsg = !users[data.from] ? 
        `Sender ${data.from} not found` : 
        `Recipient ${data.to} not found`;
      
      console.warn(`Key exchange failed: ${errorMsg}`);
      if (typeof callback === 'function') {
        callback({ success: false, error: errorMsg });
      }
      return;
    }

    const recipient = users[data.to];
    const recipientSocket = io.sockets.sockets.get(recipient.id);
    if (!recipientSocket || !recipientSocket.connected) {
      console.warn(`Recipient ${data.to} is not connected`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Recipient not connected' });
      }
      return;
    }

    const retry = (attempt = 0) => {
      io.to(recipient.id).timeout(5000).emit('key_exchange', data, (err, response) => {
        console.log(`Response from ${data.to}:`, response);
        if (err || !response?.received) {
          if (attempt < 2) {
            console.log(`Retrying key exchange to ${data.to} (attempt ${attempt + 1})`);
            setTimeout(() => retry(attempt + 1), 1000 * (attempt + 1));
          } else {
            console.warn(`Final key exchange failure to ${data.to}`);
            if (typeof callback === 'function') {
              callback({ success: false, error: 'Delivery failed after retries' });
            }
          }
        } else {
          console.log(`Key exchange delivered to ${data.to}`);
          if (typeof callback === 'function') {
            callback({ success: true });
          }
        }
      });
    };

    retry();
  });

  socket.on('encrypted_message', (data, callback) => {
    console.log(`Message from ${data.from} to ${data.to}`);
    
    if (!users[data.to]) {
      console.warn(`Recipient ${data.to} not found`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Recipient not found' });
      }
      return;
    }

    io.to(users[data.to].id).timeout(5000).emit('encrypted_message', data, (err) => {
      if (err) {
        console.warn(`Message to ${data.to} failed to deliver`);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Delivery failed' });
        }
      } else {
        console.log(`Message delivered to ${data.to}`);
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      }
    });
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      console.log(`User ${currentUser} disconnected`);
      delete users[currentUser];
      io.emit('users', Object.values(users));
      io.emit('user_left', { username: currentUser });
    }
  });
});

console.log('Socket.IO server running on port 3001');
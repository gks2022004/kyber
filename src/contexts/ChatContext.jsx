// chatContext.js
"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { SecureKEM, MessageCrypto, generateIdentityKeys } from '../utils/crypto';
import io from 'socket.io-client';
import { useRef } from 'react';

const ChatContext = createContext();

export function ChatProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [identityKeys, setIdentityKeys] = useState(null);
  const [kemKeys, setKemKeys] = useState(null);
  const [sharedSecrets, setSharedSecrets] = useState({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [messageQueue, setMessageQueue] = useState({});
  const [completedExchanges, setCompletedExchanges] = useState(new Set());

  const pendingKeyExchanges = useRef([]);
  const kemKeysRef = useRef();
  const identityKeysRef = useRef();
  const usersRef = useRef();
  const socketRef = useRef();
  const sharedSecretsRef = useRef({});
  const completedExchangesRef = useRef(new Set());
  const pendingKeyExchangeTimers = useRef({}); // Track pending key exchange timers

  useEffect(() => { kemKeysRef.current = kemKeys; }, [kemKeys]);
  useEffect(() => { identityKeysRef.current = identityKeys; }, [identityKeys]);
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { sharedSecretsRef.current = sharedSecrets; }, [sharedSecrets]);
  useEffect(() => { completedExchangesRef.current = completedExchanges; }, [completedExchanges]);

  // Clear any pending key exchange timers when unmounting
  useEffect(() => {
    return () => {
      Object.values(pendingKeyExchangeTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  useEffect(() => {
    if (kemKeys?.secretKey && pendingKeyExchanges.current.length > 0) {
      console.log("Processing queued key exchanges now that kemKeys are available");
      const exchanges = [...pendingKeyExchanges.current];
      pendingKeyExchanges.current = [];
      exchanges.forEach(data => handleKeyExchange(data));
    }
  }, [kemKeys]);

  const handleKeyExchange = async (data, callback) => {
    console.log(`Starting key exchange for ${data.to} from ${data.from}`);

    if (!kemKeysRef.current?.secretKey) {
      console.warn("kemKeys not available yet, queuing exchange from", data.from);
      pendingKeyExchanges.current.push(data);
      if (typeof callback === 'function') {
        callback({ received: false, error: 'KEM keys not available' });
      }
      return;
    }

    try {
      const currentKemKeys = kemKeysRef.current;
      const currentIdentityKeys = identityKeysRef.current;
      const currentUsers = usersRef.current;
      const currentSocket = socketRef.current;

      if (sharedSecretsRef.current[data.from]) {
        console.log(`Already have a shared secret for ${data.from}, skipping key exchange`);
        if (typeof callback === 'function') {
          callback({ received: true });
        }
        return;
      }

      let sender = currentUsers.find(u => u.username === data.from);
      if (!sender) {
        try {
          console.log(`Requesting info for ${data.from}`);
          const senderInfo = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('User info request timeout')), 5000);
            
            currentSocket.emit('get_user_info', { username: data.from });
            
            const handleUserInfo = (userInfo) => {
              if (userInfo && userInfo.username === data.from) {
                clearTimeout(timeout);
                currentSocket.off('user_info', handleUserInfo);
                resolve(userInfo);
              }
            };
            
            currentSocket.on('user_info', handleUserInfo);
          });
          
          if (senderInfo) {
            sender = senderInfo;
            setUsers(prev => [...prev.filter(u => u.username !== sender.username), sender]);
          } else {
            throw new Error('User info not available');
          }
        } catch (err) {
          console.error(`Could not retrieve info for ${data.from}:`, err);
          if (typeof callback === 'function') {
            callback({ received: false, error: 'Sender info not available' });
          }
          return;
        }
      }

      console.log(`Decapsulating shared secret with ${data.from}`);
      
      try {
        const sharedSecret = await SecureKEM.decapsulate(
          { ct: data.cipherText, sig: data.signature },
          currentKemKeys.secretKey,
          sender.identityKey
        );

        console.log(`Successfully decapsulated shared secret with ${data.from}`);

        // Update shared secrets atomically to avoid race conditions
        setSharedSecrets(prev => {
          const updated = { ...prev, [data.from]: sharedSecret };
          console.log(`Updated shared secrets. Available keys: ${Object.keys(updated).join(', ')}`);
          sharedSecretsRef.current = updated;
          return updated;
        });

        // Mark exchange as completed
        const newCompletedExchanges = new Set(completedExchangesRef.current);
        newCompletedExchanges.add(data.from);
        setCompletedExchanges(newCompletedExchanges);
        completedExchangesRef.current = newCompletedExchanges;

        // If we don't have a bi-directional exchange yet, initiate one
        const shouldInitiateExchange = !sharedSecretsRef.current[data.from];
        
        if (shouldInitiateExchange) {
          try {
            console.log(`Sending reciprocal key exchange to ${data.from}`);
            const { cipherText, signature } = await SecureKEM.encapsulate(
              sender.kemKey,
              currentIdentityKeys.privateKey
            );
            
            // Add timeout handling for the acknowledgment
            const exchangePromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Key exchange timeout')), 5000);
              
              currentSocket.emit('key_exchange', {
                to: data.from,
                from: username,
                cipherText,
                signature
              }, (ack) => {
                clearTimeout(timeout);
                if (!ack?.success) {
                  console.error(`Reciprocal key exchange failed to deliver to ${data.from}: ${ack?.error || 'No acknowledgment'}`);
                  reject(new Error(ack?.error || 'Failed to deliver key exchange'));
                } else {
                  console.log(`Reciprocal key exchange delivered to ${data.from}`);
                  resolve();
                }
              });
            });
            
            await exchangePromise;
          } catch (err) {
            console.error(`Failed to complete reciprocal key exchange with ${data.from}:`, err);
            // Maybe schedule a retry after some time
          }
        }

        // Process any queued messages
        if (messageQueue[data.from]?.length) {
          console.log(`Processing ${messageQueue[data.from].length} queued messages for ${data.from}`);
          messageQueue[data.from].forEach(msg => {
            try {
              const encrypted = MessageCrypto.encrypt(msg.message, sharedSecret);
              currentSocket.emit('encrypted_message', {
                to: data.from,
                from: username,
                nonce: encrypted.nonce,
                ciphertext: encrypted.ciphertext,
                timestamp: msg.timestamp,
              });
            } catch (err) {
              console.error(`Failed to send queued message to ${data.from}:`, err);
            }
          });
          setMessageQueue(prev => ({ ...prev, [data.from]: [] }));
        }

        if (typeof callback === 'function') {
          callback({ received: true });
        }
      } catch (decapError) {
        console.error(`Error decapsulating shared secret with ${data.from}:`, decapError);
        if (typeof callback === 'function') {
          callback({ received: false, error: decapError.message });
        }
      }
    } catch (error) {
      console.error(`Key exchange failed with ${data.from}:`, error);
      if (typeof callback === 'function') {
        callback({ received: false, error: error.message });
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn && username && !socket) {
      const initializeSecureChat = async () => {
        setIsConnecting(true);
        setConnectionError(null);

        try {
          console.log("Initializing secure chat for:", username);

          const newIdentityKeys = generateIdentityKeys();
          setIdentityKeys(newIdentityKeys);
          identityKeysRef.current = newIdentityKeys;
          console.log("Generated identity keys");

          const newKemKeys = await SecureKEM.generateKeyPair();
          setKemKeys(newKemKeys);
          kemKeysRef.current = newKemKeys;
          console.log("Generated ML-KEM keys");

          // Connect to the standalone Socket.IO server on port 3001
          const newSocket = io('http://localhost:3001', {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000
          });

          const connectionTimeout = setTimeout(() => {
            if (newSocket && !newSocket.connected) {
              console.error("Socket connection timeout");
              setConnectionError("Connection timeout. Please try again.");
              setIsConnecting(false);
              newSocket.disconnect();
            }
          }, 10000);

          newSocket.on('connect_error', (err) => {
            console.error("Socket connection error:", err.message);
            setConnectionError(`Connection error: ${err.message}`);
          });

          newSocket.on('connect', () => {
            clearTimeout(connectionTimeout);
            console.log('Connected to socket server with ID:', newSocket.id);

            newSocket.emit('join', {
              username,
              identityKey: newIdentityKeys.publicKey,
              kemKey: newKemKeys.publicKey
            });
            console.log("Sent join event with username:", username);
          });

          newSocket.on('users', (userList) => {
            const filteredUsers = userList.filter(user => user.username !== username);
            console.log(`Received users list with ${filteredUsers.length} users:`, 
              filteredUsers.map(u => u.username).join(', '));
            setUsers(filteredUsers);
            usersRef.current = filteredUsers;
            
            // Initiate key exchanges with all users
            filteredUsers.forEach(user => {
              // Don't reattempt exchanges that are already completed
              if (!completedExchangesRef.current.has(user.username) && !sharedSecretsRef.current[user.username]) {
                // Use lexicographically smaller username to initiate exchange to avoid both sides doing it
                // But add a random delay to avoid simultaneous connections
                const shouldInitiateFirst = username.localeCompare(user.username) < 0;
                const delay = shouldInitiateFirst ? 500 + Math.random() * 1000 : 3000 + Math.random() * 2000;
                
                // Clear any existing timer for this user
                if (pendingKeyExchangeTimers.current[user.username]) {
                  clearTimeout(pendingKeyExchangeTimers.current[user.username]);
                }
                
                // Set a new timer
                pendingKeyExchangeTimers.current[user.username] = setTimeout(() => {
                  initiateKeyExchange(newSocket, user, newIdentityKeys, newKemKeys, 0);
                  delete pendingKeyExchangeTimers.current[user.username];
                }, delay);
              }
            });
          });

          newSocket.on('user_joined', async (user) => {
            console.log(`User joined: ${user.username}`);
            
            setUsers(prev => {
              if (!prev.some(u => u.username === user.username)) {
                return [...prev, user];
              }
              return prev;
            });
            
            // Always initiate key exchange with new users
            if (user.username !== username) {
              if (!completedExchangesRef.current.has(user.username) && !sharedSecretsRef.current[user.username]) {
                // Use lexicographically smaller username to determine who initiates first
                const shouldInitiateFirst = username.localeCompare(user.username) < 0;
                const delay = shouldInitiateFirst ? 1000 : 3500;
                
                // Clear any existing timer for this user
                if (pendingKeyExchangeTimers.current[user.username]) {
                  clearTimeout(pendingKeyExchangeTimers.current[user.username]);
                }
                
                // Set a new timer
                pendingKeyExchangeTimers.current[user.username] = setTimeout(() => {
                  initiateKeyExchange(newSocket, user, newIdentityKeys, newKemKeys, 0);
                  delete pendingKeyExchangeTimers.current[user.username];
                }, delay);
              }
            }
          });

          newSocket.on('user_left', (data) => {
            console.log(`User left: ${data.username}`);
            
            // Cancel any pending key exchange timer for this user
            if (pendingKeyExchangeTimers.current[data.username]) {
              clearTimeout(pendingKeyExchangeTimers.current[data.username]);
              delete pendingKeyExchangeTimers.current[data.username];
            }
            
            setUsers(prev => prev.filter(user => user.username !== data.username));
            usersRef.current = usersRef.current.filter(user => user.username !== data.username);
          });

          // Updated to pass the callback to handleKeyExchange
          newSocket.on('key_exchange', (data, callback) => {
            if (data.to === username) {
              handleKeyExchange(data, callback);
            }
          });

          newSocket.on('encrypted_message', async (data) => {
            if (data.to !== username) return;
            
            const secret = sharedSecretsRef.current[data.from];
            if (!secret) {
              console.warn(`No shared secret for ${data.from}, message cannot be decrypted`);
              return;
            }

            try {
              console.log(`Decrypting message from ${data.from}`);
              const decrypted = MessageCrypto.decrypt({
                nonce: data.nonce,
                ciphertext: data.ciphertext
              }, secret);

              console.log(`Successfully decrypted message from ${data.from}: ${decrypted.substring(0, 20)}...`);
              
              setMessages(prev => {
                const newMessages = [...prev, {
                  user: data.from,
                  text: decrypted,
                  timestamp: data.timestamp || new Date().toISOString(),
                  isSelf: false
                }];
                console.log(`Updated messages list, now contains ${newMessages.length} messages`);
                return newMessages;
              });
            } catch (error) {
              console.error(`Failed to decrypt message from ${data.from}:`, error);
              
              // If decryption fails, try to re-establish the key exchange
              if (!completedExchangesRef.current.has(data.from)) {
                console.log(`Attempting to re-establish key exchange with ${data.from} after decryption failure`);
                const user = usersRef.current.find(u => u.username === data.from);
                if (user) {
                  const shouldInitiateFirst = username.localeCompare(data.from) < 0;
                  if (shouldInitiateFirst) {
                    initiateKeyExchange(socketRef.current, user, identityKeysRef.current, kemKeysRef.current, 0);
                  }
                }
              }
            }
          });

          newSocket.on('user_info', (userInfo) => {
            console.log(`Received user info for ${userInfo.username}`);
            setUsers(prev => {
              const filtered = prev.filter(u => u.username !== userInfo.username);
              return [...filtered, userInfo];
            });
          });

          newSocket.on('error', (error) => {
            console.error(`Server error: ${error.message}`);
          });

          newSocket.on('disconnect', () => {
            console.log('Disconnected from server');
            
            // Clear all pending key exchange timers
            Object.values(pendingKeyExchangeTimers.current).forEach(timer => {
              if (timer) clearTimeout(timer);
            });
            pendingKeyExchangeTimers.current = {};
          });

          setSocket(newSocket);
          socketRef.current = newSocket;
        } catch (error) {
          console.error('Failed to initialize secure chat:', error);
          setConnectionError(`Failed to initialize chat: ${error.message}`);
        } finally {
          setIsConnecting(false);
        }
      };

      initializeSecureChat();
    }

    return () => {
      if (socket) {
        console.log("Cleaning up socket connection");
        
        // Clear all pending key exchange timers
        Object.values(pendingKeyExchangeTimers.current).forEach(timer => {
          if (timer) clearTimeout(timer);
        });
        pendingKeyExchangeTimers.current = {};
        
        socket.disconnect();
        setSocket(null);
        socketRef.current = null;
      }
    };

  }, [isLoggedIn, username]);

  const initiateKeyExchange = async (socket, user, identityKeys, kemKeys, attemptCount) => {
    const maxAttempts = 3;

    try {
      console.log(`Initiating key exchange with ${user.username} (attempt ${attemptCount + 1})`);

      if (!user.kemKey || !user.identityKey) {
        console.error(`Missing public keys for ${user.username}:`, user);
        return;
      }

      // Don't send if we already have a shared secret
      if (sharedSecretsRef.current[user.username]) {
        console.log(`Already have a shared secret with ${user.username}, skipping key exchange`);
        return;
      }

      const { cipherText, signature, sharedSecret } = await SecureKEM.encapsulate(
        user.kemKey,
        identityKeys.privateKey
      );

      // Store the shared secret immediately
      setSharedSecrets(prev => {
        const updated = { ...prev, [user.username]: sharedSecret };
        sharedSecretsRef.current = updated;
        return updated;
      });

      // Mark exchange as initiated
      const newCompletedExchanges = new Set(completedExchangesRef.current);
      newCompletedExchanges.add(user.username);
      setCompletedExchanges(newCompletedExchanges);
      completedExchangesRef.current = newCompletedExchanges;

      socket.emit('key_exchange', {
        to: user.username,
        from: username,
        cipherText,
        signature
      }, (response) => {
        if (response && response.success) {
          console.log(`Key exchange delivery confirmed for ${user.username}`);
          
          // Process any queued messages now that we have a shared secret
          if (messageQueue[user.username]?.length) {
            console.log(`Processing ${messageQueue[user.username].length} queued messages for ${user.username}`);
            messageQueue[user.username].forEach(msg => {
              try {
                const encrypted = MessageCrypto.encrypt(msg.message, sharedSecret);
                socket.emit('encrypted_message', {
                  to: user.username,
                  from: username,
                  nonce: encrypted.nonce,
                  ciphertext: encrypted.ciphertext,
                  timestamp: msg.timestamp,
                });
              } catch (err) {
                console.error(`Failed to send queued message to ${user.username}:`, err);
              }
            });
            setMessageQueue(prev => ({ ...prev, [user.username]: [] }));
          }
        } else if (attemptCount < maxAttempts) {
          console.log(`Key exchange delivery failed: ${response?.error || 'Unknown error'}, retrying (${attemptCount + 1}/${maxAttempts})`);
          setTimeout(() => {
            initiateKeyExchange(socket, user, identityKeys, kemKeys, attemptCount + 1);
          }, 1000 * (attemptCount + 1));
        } else {
          console.error(`Final key exchange failure for ${user.username}: ${response?.error || 'Unknown error'}`);
        }
      });

      console.log(`Key exchange data sent to ${user.username}`);
    } catch (error) {
      console.error(`Failed to initiate key exchange with ${user.username}:`, error);
      if (attemptCount < maxAttempts) {
        const delay = Math.pow(2, attemptCount) * 1000;
        console.log(`Retrying key exchange in ${delay}ms...`);
        setTimeout(() => {
          initiateKeyExchange(socket, user, identityKeys, kemKeys, attemptCount + 1);
        }, delay);
      }
    }
  };

  const login = (name) => {
    console.log("Logging in as:", name);
    setUsername(name);
    setIsLoggedIn(true);
  };

  const sendMessage = async (message) => {
    if (!socket || !message.trim()) return;

    console.log(`Sending message: ${message}`);
    const timestamp = new Date().toISOString();

    setMessages(prev => [...prev, {
      user: username,
      text: message,
      timestamp,
      isSelf: true
    }]);

    const currentSharedSecrets = sharedSecretsRef.current;
    console.log(`Available shared secrets: ${Object.keys(currentSharedSecrets).join(', ')}`);

    for (const user of users) {
      const peer = user.username;
      console.log(`Checking if we can send to ${peer}...`);
      
      if (currentSharedSecrets[peer]) {
        try {
          console.log(`Encrypting message for ${peer}`);
          const encrypted = MessageCrypto.encrypt(message, currentSharedSecrets[peer]);
          
          socket.emit('encrypted_message', {
            to: peer,
            from: username,
            nonce: encrypted.nonce,
            ciphertext: encrypted.ciphertext,
            timestamp
          }, (ack) => {
            console.log(`Message delivery to ${peer}: ${ack?.success ? 'confirmed' : 'failed'}`);
          });
          console.log(`Message sent to ${peer}`);
        } catch (error) {
          console.error(`Failed to send message to ${peer}:`, error);
        }
      } else {
        console.warn(`Shared secret not found for ${peer}, queuing message`);
        setMessageQueue(prev => ({
          ...prev,
          [peer]: [...(prev[peer] || []), { message, timestamp }]
        }));
        
        const isExchangeCompleted = completedExchangesRef.current.has(peer);
        if (!isExchangeCompleted) {
          const peerUser = users.find(u => u.username === peer);
          if (peerUser) {
            initiateKeyExchange(socket, peerUser, identityKeysRef.current, kemKeysRef.current, 0);
          }
        }
      }
    }
  };

  return (
    <ChatContext.Provider value={{
      username,
      messages,
      users,
      login,
      sendMessage,
      isLoggedIn,
      isConnecting,
      connectionError,
      hasSecureChannels: Object.keys(sharedSecrets).length > 0
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => useContext(ChatContext);
"use client";
import { useChat } from '../contexts/ChatContext';

export default function UserList() {
  const { users, hasSecureChannels } = useChat();

  return (
    <div className="bg-white border-r h-full">
      <div className="p-4 border-b">
        <h2 className="text-lg font-medium text-gray-900">Online Users</h2>
      </div>
      
      {users.length === 0 ? (
        <div className="p-4 text-center text-gray-500">
          <p>No other users online</p>
        </div>
      ) : (
        <ul className="p-2">
          {users.map((user) => (
            <li key={user.username} className="px-3 py-2 rounded-md hover:bg-gray-50">
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  hasSecureChannels ? 'bg-green-500' : 'bg-yellow-500'
                }`}></div>
                <span className="text-gray-700">{user.username}</span>
                {!hasSecureChannels && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
                    Connecting
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      
      <div className="p-4 border-t mt-auto">
        <div className="flex items-center">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
          <span className="text-xs text-gray-500">Secure Connection</span>
        </div>
        <div className="flex items-center mt-1">
          <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
          <span className="text-xs text-gray-500">Establishing Security</span>
        </div>
      </div>
    </div>
  );
}

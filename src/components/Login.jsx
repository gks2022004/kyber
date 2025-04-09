"use client";
import { useState } from 'react';
import { useChat } from '../contexts/ChatContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const { login,connectionError } = useChat();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      login(username);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ML-KEM Secure Chat</h1>
          <p className="text-gray-600">
            Post-quantum encrypted messaging
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
  <div>
    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
      Username
    </label>
    <input
      type="text"
      id="username"
      value={username}
      onChange={(e) => setUsername(e.target.value)}
      className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
      placeholder="Enter your username"
      required
    />
  </div>

  {/* 🔴 Connection error display */}
  {connectionError && (
    <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-sm">
      {connectionError}
    </div>
  )}

  <div>
    <button
      type="submit"
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
    >
      Join Secure Chat
    </button>
  </div>
</form>

        
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Powered by ML-KEM post-quantum cryptography</p>
          <p className="mt-1">All messages are end-to-end encrypted</p>
        </div>
      </div>
    </div>
  );
}

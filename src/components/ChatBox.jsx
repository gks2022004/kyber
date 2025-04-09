"use client";
import { useState, useRef, useEffect } from 'react';
import { useChat } from '../contexts/ChatContext';
import Message from './Message';

export default function ChatBox() {
  const { messages, sendMessage, hasSecureChannels, users } = useChat();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    console.log("Messages updated:", messages);
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      sendMessage(inputMessage);
      setInputMessage('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {!hasSecureChannels && users.length > 0 && (
        <div className="bg-yellow-50 p-4 border-b border-yellow-100">
          <p className="text-yellow-700 text-sm">
            <span className="font-medium">Establishing secure channels...</span> 
            Your messages will be encrypted once secure connections are established.
          </p>
        </div>
      )}
      
      {users.length === 0 && (
        <div className="bg-blue-50 p-4 border-b border-blue-100">
          <p className="text-blue-700 text-sm">
            <span className="font-medium">No other users online.</span> 
            Wait for someone to join or invite others to chat.
          </p>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="mt-2">No messages yet</p>
              <p className="text-sm">Start the conversation by sending a message</p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <Message key={index} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="flex-1 px-4 py-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Type your message..."
            disabled={!hasSecureChannels && users.length > 0}
          />
          <button
            type="submit"
            className={`px-4 py-2 rounded-r-lg text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              hasSecureChannels 
                ? 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            disabled={!hasSecureChannels && users.length > 0}
          >
            Send
          </button>
        </div>
        {!hasSecureChannels && users.length > 0 && (
          <p className="mt-2 text-xs text-gray-500 text-center">
            Waiting for secure channels to be established...
          </p>
        )}
      </form>
    </div>
  );
}

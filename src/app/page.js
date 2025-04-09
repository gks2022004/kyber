"use client";
import { useChat } from '../contexts/ChatContext';
import Login from '../components/Login';
import ChatBox from '../components/ChatBox';
import UserList from '../components/UserList';

export default function Home() {
  const { isLoggedIn, isConnecting } = useChat();

  if (!isLoggedIn) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white border-r hidden md:block">
        <UserList />
      </aside>
      
      <main className="flex-1 flex flex-col">
        {isConnecting ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Establishing secure connection...</p>
            </div>
          </div>
        ) : (
          <ChatBox />
        )}
      </main>
    </div>
  );
}

"use client";
import { formatDistanceToNow } from 'date-fns';

export default function Message({ message }) {
  const { user, text, timestamp, isSelf } = message;
  
  const formattedTime = timestamp ? 
    formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : 
    '';

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-start gap-2 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isSelf ? 'bg-indigo-600' : 'bg-gray-600'
          } text-white font-medium text-sm`}>
            {user.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex flex-col">
            <div className={`px-4 py-2 rounded-lg ${
              isSelf 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-gray-100 text-gray-800 rounded-tl-none'
            }`}>
              <p className="text-sm">{text}</p>
            </div>
            
            <div className={`mt-1 text-xs text-gray-500 ${isSelf ? 'text-right' : 'text-left'}`}>
              <span className="mr-1">{user}</span>
              <span>•</span>
              <span className="ml-1">{formattedTime}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

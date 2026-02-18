import React, { useState, useEffect, useRef } from "react";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { withAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css"; // Ensure styles are loaded
import awsconfig from "./aws-exports";
import "./App.css";

Amplify.configure(awsconfig);

function App({ signOut, user }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef(null);

  // Getting the email/username from Cognito
  const email = user?.signInDetails?.loginId || user?.username;

  useEffect(() => {
    if (!user) return;

    let ws;
    let reconnectTimeout;

    const connectWebSocket = async () => {
      try {
        const session = await fetchAuthSession({ forceRefresh: false });
        const token = session.tokens?.idToken?.toString();

        if (!token) {
          console.error("No token found in session");
          return;
        }

        // UPDATED: Added the trailing slash before the ?token for better compatibility
        const wsUrl = `wss://quyq7of7z1.execute-api.us-east-1.amazonaws.com/dev/?token=${token}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("WebSocket Connected");
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            setMessages((prev) => [
              ...prev,
              { 
                text: data.message, 
                sender: data.username || data.sender || "Anonymous" 
              },
            ]);
          } catch (err) {
            console.error("Error parsing message:", err);
          }
        };

        ws.onclose = () => {
          console.log("WebSocket Closed, reconnecting in 3s...");
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        socketRef.current = ws;
      } catch (err) {
        console.error("Failed to connect:", err);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [user]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      alert("Still connecting to server... please wait.");
      return;
    }

    const payload = {
      action: "sendMessage",
      message: newMessage,
      username: email, 
    };

    socketRef.current.send(JSON.stringify(payload));
    setNewMessage("");
  };

  return (
    <div className="chat-wrapper">
      <div className="sidebar">
        <h3>Game Chat</h3>
        <div className="status-indicator">
          <span className={`dot ${wsConnected ? "online" : "offline"}`}></span>
          {wsConnected ? "Online" : "Connecting..."}
        </div>
        <p className="user-email">{email}</p>
        <button className="logout-btn" onClick={signOut}>
          Logout
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-header"># general</div>

        <div className="messages">
          {messages.length === 0 && <div className="empty-chat">No messages yet. Start the conversation!</div>}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.sender === email ? "own" : "other"}`}
            >
              <div className="message-info">
                <strong>{msg.sender}</strong>
              </div>
              <div className="message-bubble">
                <span>{msg.text}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="input-box">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button 
            onClick={sendMessage} 
            disabled={!wsConnected || !newMessage.trim()}
            className="send-btn"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default withAuthenticator(App);
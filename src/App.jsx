import React, { useState, useEffect, useRef } from "react";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { withAuthenticator } from "@aws-amplify/ui-react";
import awsconfig from "./aws-exports";
import "./App.css";

Amplify.configure(awsconfig);

function App({ signOut, user }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef(null);

  const email = user?.signInDetails?.loginId || user?.username;

  useEffect(() => {
    if (!user) return;

    let ws;
    let reconnectTimeout;

    const connectWebSocket = async () => {
      try {
        // Force refresh false to use cached session, avoids Identity Pool call
        const session = await fetchAuthSession({ forceRefresh: false });
        const token = session.tokens?.idToken?.toString();

        if (!token) {
          console.error("No token found in session");
          return;
        }

        const wsUrl = `wss://quyq7of7z1.execute-api.us-east-1.amazonaws.com/dev?token=${token}`;

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
              { text: data.message, sender: data.username || "Anonymous" },
            ]);
          } catch (err) {
            console.error("Error parsing message:", err);
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket Error:", err);
        };

        ws.onclose = () => {
          console.log("WebSocket Closed, reconnecting in 3s...");
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        socketRef.current = ws;
      } catch (err) {
        console.error("Failed to get session:", err);
        // Retry connection after 3s even if session fetch fails
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
      console.error("Socket not connected. Wait until it opens.");
      return;
    }

    const payload = {
      action: "sendMessage",
      message: newMessage,
    };

    socketRef.current.send(JSON.stringify(payload));

    // Optimistic UI — show own message immediately
    setMessages((prev) => [...prev, { text: newMessage, sender: email }]);
    setNewMessage("");
  };

  return (
    <div className="chat-wrapper">
      <div className="sidebar">
        <h3>Game Chat</h3>
        <p className="user-email">{email}</p>
        <button className="logout-btn" onClick={signOut}>
          Logout
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-header"># general</div>

        <div className="messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.sender === email ? "own" : "other"}`}
            >
              <strong>{msg.sender}</strong>
              <span>{msg.text}</span>
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
          <button onClick={sendMessage} disabled={!wsConnected}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default withAuthenticator(App);
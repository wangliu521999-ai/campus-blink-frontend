"use client";

import { useEffect, useRef, useState } from "react";

// 注意这里：我们把顶部的 import AMapLoader 删掉了！

const API_URL = "http://127.0.0.1:8000/api/bubbles";
const WS_URL = "ws://127.0.0.1:8000/ws";

export default function Home() {
  const mapRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("🍚");

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 【终极魔法】：使用动态 import，强制只在用户的浏览器里加载高德地图工具
    import("@amap/amap-jsapi-loader").then((AMapLoaderModule) => {
      const AMapLoader = AMapLoaderModule.default || AMapLoaderModule;

      (window as any)._AMapSecurityConfig = {
        securityJsCode: "99558b885fe17660d8fbf12fce5efcdc", // <--- 填这里
      };

      AMapLoader.load({
        key: "f96aae15f8dfda913d2f6cc989677c66",           // <--- 填这里
        version: "2.0",
        plugins: ["AMap.Geolocation"],
      }).then((AMap) => {
          mapRef.current = new AMap.Map("map-container", {
            zoom: 16,
            center: [116.397428, 39.90923], 
          });

          const geolocation = new AMap.Geolocation({ enableHighAccuracy: true, zoomToAccuracy: true });
          mapRef.current.addControl(geolocation);
          geolocation.getCurrentPosition((status: string, result: any) => {
            if (status === 'complete') setCurrentPos([result.position.lng, result.position.lat]);
          });

          setIsMapLoaded(true);
          fetchBubbles(AMap); 
      }).catch(e => console.error(e));
    });

    return () => mapRef.current?.destroy();
  }, []);

  const fetchBubbles = async (AMapInstance: any) => {
    try {
      const res = await fetch(API_URL);
      const resData = await res.json();
      
      if (resData.status === "success" && mapRef.current) {
        mapRef.current.clearMap(); 
        
        resData.data.forEach((bubble: any) => {
          const marker = new AMapInstance.Marker({
            position: [bubble.lng, bubble.lat],
            content: `
              <div class="bg-white px-3 py-2 rounded-2xl shadow-lg border border-gray-100 flex items-center space-x-2 animate-bounce cursor-pointer hover:bg-gray-50 transition-colors">
                <span class="text-xl">${bubble.icon}</span>
                <span class="text-sm font-medium text-gray-800">${bubble.text}</span>
              </div>
            `,
            offset: new AMapInstance.Pixel(-50, -50),
          });
          
          marker.on('click', () => {
            joinChatRoom(bubble.id);
          });

          mapRef.current.add(marker);
        });
      }
    } catch (e) {
      console.log("获取气泡失败，等待 Python 服务器启动");
    }
  };

  const handleFlash = async () => {
    if (!currentPos || !text) return;
    const newBubble = {
      user_id: "user_" + Math.floor(Math.random() * 10000),
      lat: currentPos[1], lng: currentPos[0], icon: icon, text: text, expire_minutes: 60,
    };
    try {
      await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBubble) });
      setText(""); setShowForm(false); fetchBubbles((window as any).AMap); 
    } catch (e) { alert("发送失败，请检查 Python 服务器"); }
  };

  const joinChatRoom = (bubbleId: string) => {
    setActiveChat(bubbleId);
    setMessages([]); 
    
    const ws = new WebSocket(`${WS_URL}/${bubbleId}`);
    ws.onopen = () => console.log("连接聊天室成功！");
    ws.onmessage = (event) => setMessages((prev) => [...prev, event.data]);
    wsRef.current = ws;
  };

  const sendMessage = () => {
    if (wsRef.current && chatInput.trim() !== "") {
      wsRef.current.send(chatInput); 
      setChatInput("");
    }
  };

  const exitChat = () => {
    if (wsRef.current) wsRef.current.close(); 
    setActiveChat(null);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-gray-100">
      <div id="map-container" className="absolute inset-0 w-full h-full" />

      <div className="absolute bottom-0 left-0 w-full z-10 flex justify-center pb-12 px-4">
        {activeChat ? (
           <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white shadow-2xl rounded-[2rem] p-6 flex flex-col h-80 animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
                <h2 className="font-bold text-gray-800">临时聊天室 🔒</h2>
                <button onClick={exitChat} className="text-red-500 font-medium hover:bg-red-50 px-3 py-1 rounded-full text-sm">撤退</button>
             </div>
             
             <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                {messages.length === 0 ? <p className="text-gray-400 text-sm text-center mt-10">对方正在等你的消息...</p> : null}
                {messages.map((msg, idx) => (
                  <div key={idx} className="bg-blue-100 text-blue-900 px-4 py-2 rounded-2xl w-fit max-w-[80%] break-words shadow-sm">{msg}</div>
                ))}
             </div>
             
             <div className="flex space-x-2">
               <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="说点什么..." className="flex-1 px-4 py-2 rounded-xl bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
               <button onClick={sendMessage} className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-bold shadow-md transition-transform active:scale-95">发送</button>
             </div>
           </div>
        ) : (
          <div className="w-full max-w-md bg-white/60 backdrop-blur-xl border border-white/50 shadow-2xl rounded-[2.5rem] p-6 flex flex-col items-center transition-all duration-300">
            <div className="w-12 h-1.5 bg-gray-300/80 rounded-full mb-4" /> 
            {!showForm ? (
              <>
                <h1 className="text-xl font-bold text-gray-800 tracking-wider mb-2">校内闪现</h1>
                <p className="text-gray-600 text-sm mb-6">{isMapLoaded ? "地图已就绪，点击气泡即可聊天" : "正在连接卫星..."}</p>
                <button onClick={() => setShowForm(true)} className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center space-x-2">
                  <span className="text-2xl">⚡️</span><span>立即闪现</span>
                </button>
              </>
            ) : (
              <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex space-x-2">
                  {['🍚', '📚', '🏀', '☕️'].map(emoji => (
                    <button key={emoji} onClick={() => setIcon(emoji)} className={`text-2xl p-2 rounded-xl transition-all ${icon === emoji ? 'bg-white shadow-md scale-110' : 'hover:bg-white/50'}`}>{emoji}</button>
                  ))}
                </div>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="一缺三，速来..." className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800" />
                <div className="flex space-x-3">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-gray-200/50 hover:bg-gray-200/80 text-gray-700 font-semibold rounded-xl transition-colors">取消</button>
                  <button onClick={handleFlash} className="flex-2 w-2/3 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-md transition-transform active:scale-95">发射气泡</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
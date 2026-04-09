"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = "https://campus-blink-backend.onrender.com/api/bubbles";
const WS_URL = "wss://campus-blink-backend.onrender.com/ws";

export default function Home() {
  const mapRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("📍"); // 默认改成更通用的定位符

  const [category, setCategory] = useState("chat");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [expireMinutes, setExpireMinutes] = useState(120);

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    import("@amap/amap-jsapi-loader").then((AMapLoaderModule) => {
      const AMapLoader = AMapLoaderModule.default || AMapLoaderModule;

      (window as any)._AMapSecurityConfig = {
        securityJsCode: "99558b885fe17660d8fbf12fce5efcdc", 
      };

      AMapLoader.load({
        key: "f96aae15f8dfda913d2f6cc989677c66",          
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
          const timeTagHtml = bubble.category === 'activity' && bubble.start_time && bubble.end_time
            ? `<div class="text-[10px] text-green-700 font-bold mt-1 bg-green-100/80 px-2 py-0.5 rounded w-max border border-green-200">⏰ ${bubble.start_time} - ${bubble.end_time}</div>`
            : '';

          const marker = new AMapInstance.Marker({
            position: [bubble.lng, bubble.lat],
            content: `
              <div class="bg-white px-3 py-2 rounded-2xl shadow-lg border border-gray-100 flex flex-col animate-bounce cursor-pointer hover:bg-gray-50 transition-colors">
                <div class="flex items-center space-x-2">
                  <span class="text-xl">${bubble.icon}</span>
                  <span class="text-sm font-medium text-gray-800">${bubble.text}</span>
                </div>
                ${timeTagHtml}
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
      console.log("获取气泡失败，等待服务器连接");
    }
  };

  const handleFlash = async () => {
    if (!currentPos || !text) return;
    
    const newBubble = {
      user_id: "user_" + Math.floor(Math.random() * 10000),
      lat: currentPos[1], 
      lng: currentPos[0], 
      icon: icon || "📍", // 如果用户删空了，给个保底
      text: text, 
      expire_minutes: expireMinutes,
      category: category,
      start_time: category === "activity" && startTime ? startTime : null,
      end_time: category === "activity" && endTime ? endTime : null,
    };

    try {
      await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBubble) });
      resetForm();
      fetchBubbles((window as any).AMap); 
    } catch (e) { 
      alert("发送失败，请检查服务器连接"); 
    }
  };

  const resetForm = () => {
    setText(""); 
    setShowForm(false);
    setCategory("chat");
    setStartTime("");
    setEndTime("");
    setExpireMinutes(120);
    setIcon("📍");
  };

  const toggleCategory = (cat: string) => {
    setCategory(cat);
    setExpireMinutes(cat === "activity" ? 720 : 120);
  };

  const joinChatRoom = (bubbleId: string) => {
    setActiveChat(bubbleId);
    setMessages([]); 
    const ws = new WebSocket(`${WS_URL}/${bubbleId}`);
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
                
                {/* 1. 分类选择器 */}
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => toggleCategory("chat")}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      category === "chat" ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400" : "bg-white/50 text-gray-500 hover:bg-white"
                    }`}
                  >
                    💬 吐槽/心情
                  </button>
                  <button
                    onClick={() => toggleCategory("activity")}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      category === "activity" ? "bg-green-100 text-green-700 ring-2 ring-green-400" : "bg-white/50 text-gray-500 hover:bg-white"
                    }`}
                  >
                    🏀 约局/活动
                  </button>
                </div>

                {/* ================= 🚀 新增：高度自由的表情栏 ================= */}
                <div className="flex items-center space-x-2 bg-white/40 p-1.5 rounded-2xl border border-white/60">
                  {/* 自定义表情输入框 */}
                  <div className="relative flex-shrink-0 group">
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => {
                        // 巧妙的逻辑：用户输入多个表情，我们永远只截取最后一个，保证只显示一个图标
                        const val = e.target.value;
                        const chars = Array.from(val);
                        if (chars.length > 0) {
                          setIcon(chars[chars.length - 1]);
                        } else {
                          setIcon("");
                        }
                      }}
                      className="w-12 h-12 text-2xl text-center rounded-xl bg-white shadow-sm border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer placeholder-gray-300"
                      placeholder="✍️"
                    />
                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-sm pointer-events-none">自定义</div>
                  </div>

                  <div className="w-px h-6 bg-gray-300 mx-1"></div>

                  {/* 快捷推荐滚动列表 */}
                  <div className="flex space-x-2 flex-1 overflow-x-auto scrollbar-hide py-1">
                    {['🍚', '📚', '🏀', '🎮', '🎤', '🏃', '🐱', '☕️'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => setIcon(emoji)}
                        className={`text-xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                          icon === emoji ? 'bg-white shadow-md scale-110 border border-gray-100' : 'hover:bg-white/70'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <input 
                  type="text" 
                  value={text} 
                  onChange={(e) => setText(e.target.value)} 
                  placeholder={category === "chat" ? "此时此刻想说点什么..." : "一缺三，速来（比如：二食堂开黑）..."} 
                  className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 shadow-inner" 
                />

                {/* 2. 约局时间选择 */}
                {category === "activity" && (
                  <div className="flex gap-2 items-center w-full bg-green-50/80 p-2.5 rounded-xl border border-green-200 shadow-inner animate-in zoom-in-95">
                    <span className="text-xs text-green-700 font-bold whitespace-nowrap pl-1">活动时间:</span>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border-none p-1.5 rounded-lg bg-white text-sm flex-1 focus:ring-2 focus:ring-green-400 outline-none text-gray-700 shadow-sm" />
                    <span className="text-gray-400 text-xs">至</span>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border-none p-1.5 rounded-lg bg-white text-sm flex-1 focus:ring-2 focus:ring-green-400 outline-none text-gray-700 shadow-sm" />
                  </div>
                )}

                {/* 3. 存活时长选择器 */}
                <div className="pt-1">
                  <p className="text-[11px] text-gray-400 mb-1.5 ml-1 font-medium">气泡将在多久后消失？</p>
                  <div className="flex bg-gray-100/50 p-1 rounded-xl gap-1">
                    {[
                      { label: "🚀 30m", val: 30 },
                      { label: "⏳ 2h", val: 120 },
                      { label: "📅 12h", val: 720 },
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => setExpireMinutes(item.val)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          expireMinutes === item.val ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-3 mt-2">
                  <button onClick={resetForm} className="flex-1 py-3 bg-gray-200/50 hover:bg-gray-200/80 text-gray-700 font-semibold rounded-xl transition-colors">取消</button>
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
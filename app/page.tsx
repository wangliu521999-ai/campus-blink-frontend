"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = "https://campus-blink-backend.onrender.com/api/bubbles";
const WS_URL = "wss://campus-blink-backend.onrender.com/ws";

export default function Home() {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]); 
  const aMapRef = useRef<any>(null);   
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  
  // 🚀 新增：本地永久身份证
  const [myUserId, setMyUserId] = useState<string>("");

  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("📍");
  const [category, setCategory] = useState("chat");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [expireMinutes, setExpireMinutes] = useState(120);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🚀 修改：不再只存 ID，而是存整个气泡对象，为了判断是不是自己发的
  const [activeChatBubble, setActiveChatBubble] = useState<any>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 🚀 初始化：生成或获取本地永久身份证
    let storedId = localStorage.getItem("campus_blink_user_id");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("campus_blink_user_id", storedId);
    }
    setMyUserId(storedId);

    import("@amap/amap-jsapi-loader").then((AMapLoaderModule) => {
      const AMapLoader = AMapLoaderModule.default || AMapLoaderModule;

      (window as any)._AMapSecurityConfig = { securityJsCode: "99558b885fe17660d8fbf12fce5efcdc" };

      AMapLoader.load({
        key: "f96aae15f8dfda913d2f6cc989677c66",          
        version: "2.0",
        plugins: ["AMap.Geolocation"],
      }).then((AMap) => {
          mapRef.current = new AMap.Map("map-container", {
            zoom: 16, center: [116.397428, 39.90923], 
          });

          const geolocation = new AMap.Geolocation({ enableHighAccuracy: true, zoomToAccuracy: true });
          mapRef.current.addControl(geolocation);
          geolocation.getCurrentPosition((status: string, result: any) => {
            if (status === 'complete') setCurrentPos([result.position.lng, result.position.lat]);
          });

          aMapRef.current = AMap;
          setIsMapLoaded(true);
          fetchBubbles(AMap).finally(() => setIsLoading(false));
      }).catch(e => { console.error(e); setIsLoading(false); });
    });

    return () => mapRef.current?.destroy();
  }, []);

  const fetchBubbles = async (AMapInstance?: any) => {
    const AMap = AMapInstance ?? aMapRef.current;
    if (!AMap || !mapRef.current) return;
    try {
      const res = await fetch(API_URL);
      const resData = await res.json();
      if (resData.status !== "success") return;

      if (markersRef.current.length > 0) {
        mapRef.current.remove(markersRef.current);
      }

      const newMarkers: any[] = [];
      resData.data.forEach((bubble: any) => {
        const timeTagHtml = bubble.category === 'activity' && bubble.start_time && bubble.end_time
          ? `<div class="text-[10px] text-green-700 font-bold mt-1 bg-green-100/80 px-2 py-0.5 rounded w-max border border-green-200">⏰ ${bubble.start_time} - ${bubble.end_time}</div>`
          : '';

        const marker = new AMap.Marker({
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
          offset: new AMap.Pixel(-50, -50),
        });

        // 🚀 修改：把整个 bubble 对象传进聊天室
        marker.on('click', () => { joinChatRoom(bubble); });
        
        mapRef.current.add(marker); 
        newMarkers.push(marker);
      });
      markersRef.current = newMarkers;
    } catch (e) { console.log("获取气泡失败"); }
  };

  const handleFlash = async () => {
    if (!currentPos) { alert('正在获取您的精准位置，请稍等几秒后再试~'); return; }
    if (!text) return;

    const newBubble = {
      user_id: myUserId, // 🚀 提交时带上自己的专属身份证
      lat: currentPos[1], lng: currentPos[0],
      icon: icon || "📍", text: text, expire_minutes: expireMinutes,
      category: category,
      start_time: category === "activity" && startTime ? startTime : null,
      end_time: category === "activity" && endTime ? endTime : null,
    };

    setIsSubmitting(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBubble),
      });
      if (!res.ok) {
        let errMsg = `发送失败（${res.status}）`;
        try { const errData = await res.json(); errMsg = errData.detail || errData.message; } catch (_) {}
        alert(errMsg); return;
      }
      resetForm(); fetchBubbles();
    } catch (e) { alert("网络异常"); } 
    finally { setIsSubmitting(false); }
  };

  // 🚀 新增：撤销气泡动作
  const handleDeleteBubble = async () => {
    if (!activeChatBubble) return;
    const confirmDelete = window.confirm("确定要撤销这个闪现吗？聊天室将被立即解散！");
    if (!confirmDelete) return;

    try {
      // 携带气泡ID和自己的身份ID去请求删除
      const res = await fetch(`${API_URL}/${activeChatBubble.id}?user_id=${myUserId}`, { method: 'DELETE' });
      if (res.ok) {
        alert("撤销成功！地图上的气泡已销毁。");
        exitChat();
        fetchBubbles(); // 刷新地图，气泡消失
      } else {
        const errData = await res.json();
        alert(errData.detail || "撤销失败");
      }
    } catch (e) { alert("网络异常，撤销失败"); }
  };

  const resetForm = () => { setText(""); setShowForm(false); setCategory("chat"); setStartTime(""); setEndTime(""); setExpireMinutes(120); setIcon("📍"); };
  const toggleCategory = (cat: string) => { setCategory(cat); setExpireMinutes(cat === "activity" ? 720 : 120); };

  const joinChatRoom = (bubble: any) => {
    if (activeChatBubble?.id === bubble.id && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    setActiveChatBubble(bubble);
    setMessages([]); 
    const ws = new WebSocket(`${WS_URL}/${bubble.id}`);
    ws.onmessage = (event) => setMessages((prev) => [...prev, event.data]);
    wsRef.current = ws;
  };

  const sendMessage = () => {
    if (wsRef.current && chatInput.trim() !== "") { wsRef.current.send(chatInput); setChatInput(""); }
  };

  const exitChat = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setActiveChatBubble(null);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-gray-100">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-indigo-100">
          <div className="flex flex-col items-center space-y-5 p-10 rounded-3xl bg-white/80 backdrop-blur-xl shadow-2xl border border-white/60">
            <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1 text-center">
              <p className="text-xl font-bold text-gray-800 tracking-wider">校内闪现</p>
              <p className="text-sm text-gray-500">正在连接校园卫星网络...</p>
            </div>
          </div>
        </div>
      )}
      <div id="map-container" className="absolute inset-0 w-full h-full" />
      <div className="absolute bottom-0 left-0 w-full z-10 flex justify-center pb-12 px-4">
        {activeChatBubble ? (
           <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white shadow-2xl rounded-[2rem] p-6 flex flex-col h-80 animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  {activeChatBubble.icon} 临时聊天室
                </h2>
                <div className="flex gap-2">
                  {/* 🚀 只有当发起人是自己时，才显示红色的撤销按钮 */}
                  {myUserId === activeChatBubble.user_id && (
                    <button onClick={handleDeleteBubble} className="text-white bg-red-500 font-medium hover:bg-red-600 px-3 py-1 rounded-full text-sm shadow-sm transition-transform active:scale-95">撤销闪现</button>
                  )}
                  <button onClick={exitChat} className="text-gray-500 font-medium hover:bg-gray-100 px-3 py-1 rounded-full text-sm border border-gray-200">撤退</button>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto mb-4 space-y-2 flex flex-col">
                {messages.length === 0 ? <p className="text-gray-400 text-sm text-center mt-10">对方正在等你的消息...</p> : null}
                {messages.map((msg, idx) => {
                  const isSystemWarning = msg.includes("⚠️ 发起人已撤销");
                  return (
                    <div key={idx} className={`px-4 py-2 rounded-2xl w-fit max-w-[80%] break-words shadow-sm ${isSystemWarning ? 'bg-red-100 text-red-700 w-full text-center mx-auto text-xs font-bold' : 'bg-blue-100 text-blue-900'}`}>{msg}</div>
                  )
                })}
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
                <div className="flex gap-2 w-full">
                  <button onClick={() => toggleCategory("chat")} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${category === "chat" ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400" : "bg-white/50 text-gray-500 hover:bg-white"}`}>💬 吐槽/心情</button>
                  <button onClick={() => toggleCategory("activity")} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${category === "activity" ? "bg-green-100 text-green-700 ring-2 ring-green-400" : "bg-white/50 text-gray-500 hover:bg-white"}`}>🏀 约局/活动</button>
                </div>
                <div className="flex items-center space-x-2 bg-white/40 p-1.5 rounded-2xl border border-white/60">
                  <div className="relative flex-shrink-0 group">
                    <input type="text" value={icon} onChange={(e) => { const chars = Array.from(e.target.value); setIcon(chars.length > 0 ? chars[chars.length - 1] : ""); }} className="w-12 h-12 text-2xl text-center rounded-xl bg-white shadow-sm border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer placeholder-gray-300" placeholder="✍️" />
                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-sm pointer-events-none">自定义</div>
                  </div>
                  <div className="w-px h-6 bg-gray-300 mx-1"></div>
                  <div className="flex space-x-2 flex-1 overflow-x-auto scrollbar-hide py-1">
                    {['🍚', '📚', '🏀', '🎮', '🎤', '🏃', '🐱', '☕️'].map(emoji => (
                      <button key={emoji} onClick={() => setIcon(emoji)} className={`text-xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${icon === emoji ? 'bg-white shadow-md scale-110 border border-gray-100' : 'hover:bg-white/70'}`}>{emoji}</button>
                    ))}
                  </div>
                </div>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={category === "chat" ? "此时此刻想说点什么..." : "一缺三，速来（比如：二食堂开黑）..."} className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 shadow-inner" />
                {category === "activity" && (
                  <div className="flex gap-2 items-center w-full bg-green-50/80 p-2.5 rounded-xl border border-green-200 shadow-inner animate-in zoom-in-95">
                    <span className="text-xs text-green-700 font-bold whitespace-nowrap pl-1">活动时间:</span>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border-none p-1.5 rounded-lg bg-white text-sm flex-1 focus:ring-2 focus:ring-green-400 outline-none text-gray-700 shadow-sm" />
                    <span className="text-gray-400 text-xs">至</span>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border-none p-1.5 rounded-lg bg-white text-sm flex-1 focus:ring-2 focus:ring-green-400 outline-none text-gray-700 shadow-sm" />
                  </div>
                )}
                <div className="pt-1">
                  <p className="text-[11px] text-gray-400 mb-1.5 ml-1 font-medium">气泡将在多久后消失？</p>
                  <div className="flex bg-gray-100/50 p-1 rounded-xl gap-1">
                    {[{ label: "🚀 30m", val: 30 }, { label: "⏳ 2h", val: 120 }, { label: "📅 12h", val: 720 }].map((item) => (
                      <button key={item.val} onClick={() => setExpireMinutes(item.val)} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${expireMinutes === item.val ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>{item.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex space-x-3 mt-2">
                  <button onClick={resetForm} className="flex-1 py-3 bg-gray-200/50 hover:bg-gray-200/80 text-gray-700 font-semibold rounded-xl transition-colors">取消</button>
                  <button onClick={handleFlash} disabled={isSubmitting} className="flex-2 w-2/3 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-md transition-transform active:scale-95">{isSubmitting ? "发射中..." : "发射气泡"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = "https://campus-blink-backend.onrender.com/api/bubbles";
const WS_URL = "wss://campus-blink-backend.onrender.com/ws";

export default function Home() {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]); 
  const aMapRef = useRef<any>(null);   
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  
  // 🚀 新增：本地永久身份证
  const [myUserId, setMyUserId] = useState<string>("");

  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("📍");
  const [category, setCategory] = useState("chat");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [expireMinutes, setExpireMinutes] = useState(120);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🚀 修改：不再只存 ID，而是存整个气泡对象，为了判断是不是自己发的
  const [activeChatBubble, setActiveChatBubble] = useState<any>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 🚀 初始化：生成或获取本地永久身份证
    let storedId = localStorage.getItem("campus_blink_user_id");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("campus_blink_user_id", storedId);
    }
    setMyUserId(storedId);

    import("@amap/amap-jsapi-loader").then((AMapLoaderModule) => {
      const AMapLoader = AMapLoaderModule.default || AMapLoaderModule;

      (window as any)._AMapSecurityConfig = { securityJsCode: "99558b885fe17660d8fbf12fce5efcdc" };

      AMapLoader.load({
        key: "f96aae15f8dfda913d2f6cc989677c66",          
        version: "2.0",
        plugins: ["AMap.Geolocation"],
      }).then((AMap) => {
          mapRef.current = new AMap.Map("map-container", {
            zoom: 16, center: [116.397428, 39.90923], 
          });

          const geolocation = new AMap.Geolocation({ enableHighAccuracy: true, zoomToAccuracy: true });
          mapRef.current.addControl(geolocation);
          geolocation.getCurrentPosition((status: string, result: any) => {
            if (status === 'complete') setCurrentPos([result.position.lng, result.position.lat]);
          });

          aMapRef.current = AMap;
          setIsMapLoaded(true);
          fetchBubbles(AMap).finally(() => setIsLoading(false));
      }).catch(e => { console.error(e); setIsLoading(false); });
    });

    return () => mapRef.current?.destroy();
  }, []);

  const fetchBubbles = async (AMapInstance?: any) => {
    const AMap = AMapInstance ?? aMapRef.current;
    if (!AMap || !mapRef.current) return;
    try {
      const res = await fetch(API_URL);
      const resData = await res.json();
      if (resData.status !== "success") return;

      if (markersRef.current.length > 0) {
        mapRef.current.remove(markersRef.current);
      }

      const newMarkers: any[] = [];
      resData.data.forEach((bubble: any) => {
        const timeTagHtml = bubble.category === 'activity' && bubble.start_time && bubble.end_time
          ? `<div class="text-[10px] text-green-700 font-bold mt-1 bg-green-100/80 px-2 py-0.5 rounded w-max border border-green-200">⏰ ${bubble.start_time} - ${bubble.end_time}</div>`
          : '';

        const marker = new AMap.Marker({
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
          offset: new AMap.Pixel(-50, -50),
        });

        // 🚀 修改：把整个 bubble 对象传进聊天室
        marker.on('click', () => { joinChatRoom(bubble); });
        
        mapRef.current.add(marker); 
        newMarkers.push(marker);
      });
      markersRef.current = newMarkers;
    } catch (e) { console.log("获取气泡失败"); }
  };

  const handleFlash = async () => {
    if (!currentPos) { alert('正在获取您的精准位置，请稍等几秒后再试~'); return; }
    if (!text) return;

    const newBubble = {
      user_id: myUserId, // 🚀 提交时带上自己的专属身份证
      lat: currentPos[1], lng: currentPos[0],
      icon: icon || "📍", text: text, expire_minutes: expireMinutes,
      category: category,
      start_time: category === "activity" && startTime ? startTime : null,
      end_time: category === "activity" && endTime ? endTime : null,
    };

    setIsSubmitting(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBubble),
      });
      if (!res.ok) {
        let errMsg = `发送失败（${res.status}）`;
        try { const errData = await res.json(); errMsg = errData.detail || errData.message; } catch (_) {}
        alert(errMsg); return;
      }
      resetForm(); fetchBubbles();
    } catch (e) { alert("网络异常"); } 
    finally { setIsSubmitting(false); }
  };

  // 🚀 新增：撤销气泡动作
  const handleDeleteBubble = async () => {
    if (!activeChatBubble) return;
    const confirmDelete = window.confirm("确定要撤销这个闪现吗？聊天室将被立即解散！");
    if (!confirmDelete) return;

    try {
      // 携带气泡ID和自己的身份ID去请求删除
      const res = await fetch(`${API_URL}/${activeChatBubble.id}?user_id=${myUserId}`, { method: 'DELETE' });
      if (res.ok) {
        alert("撤销成功！地图上的气泡已销毁。");
        exitChat();
        fetchBubbles(); // 刷新地图，气泡消失
      } else {
        const errData = await res.json();
        alert(errData.detail || "撤销失败");
      }
    } catch (e) { alert("网络异常，撤销失败"); }
  };

  const resetForm = () => { setText(""); setShowForm(false); setCategory("chat"); setStartTime(""); setEndTime(""); setExpireMinutes(120); setIcon("📍"); };
  const toggleCategory = (cat: string) => { setCategory(cat); setExpireMinutes(cat === "activity" ? 720 : 120); };

  const joinChatRoom = (bubble: any) => {
    if (activeChatBubble?.id === bubble.id && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    setActiveChatBubble(bubble);
    setMessages([]); 
    const ws = new WebSocket(`${WS_URL}/${bubble.id}`);
    ws.onmessage = (event) => setMessages((prev) => [...prev, event.data]);
    wsRef.current = ws;
  };

  const sendMessage = () => {
    if (wsRef.current && chatInput.trim() !== "") { wsRef.current.send(chatInput); setChatInput(""); }
  };

  const exitChat = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setActiveChatBubble(null);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-gray-100">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-indigo-100">
          <div className="flex flex-col items-center space-y-5 p-10 rounded-3xl bg-white/80 backdrop-blur-xl shadow-2xl border border-white/60">
            <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1 text-center">
              <p className="text-xl font-bold text-gray-800 tracking-wider">校内闪现</p>
              <p className="text-sm text-gray-500">正在连接校园卫星网络...</p>
            </div>
          </div>
        </div>
      )}
      <div id="map-container" className="absolute inset-0 w-full h-full" />
      <div className="absolute bottom-0 left-0 w-full z-10 flex justify-center pb-12 px-4">
        {activeChatBubble ? (
           <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white shadow-2xl rounded-[2rem] p-6 flex flex-col h-80 animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  {activeChatBubble.icon} 临时聊天室
                </h2>
                <div className="flex gap-2">
                  {/* 🚀 只有当发起人是自己时，才显示红色的撤销按钮 */}
                  {myUserId === activeChatBubble.user_id && (
                    <button onClick={handleDeleteBubble} className="text-white bg-red-500 font-medium hover:bg-red-600 px-3 py-1 rounded-full text-sm shadow-sm transition-transform active:scale-95">撤销闪现</button>
                  )}
                  <button onClick={exitChat} className="text-gray-500 font-medium hover:bg-gray-100 px-3 py-1 rounded-full text-sm border border-gray-200">撤退</button>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto mb-4 space-y-2 flex flex-col">
                {messages.length === 0 ? <p className="text-gray-400 text-sm text-center mt-10">对方正在等你的消息...</p> : null}
                {messages.map((msg, idx) => {
                  const isSystemWarning = msg.includes("⚠️ 发起人已撤销");
                  return (
                    <div key={idx} className={`px-4 py-2 rounded-2xl w-fit max-w-[80%] break-words shadow-sm ${isSystemWarning ? 'bg-red-100 text-red-700 w-full text-center mx-auto text-xs font-bold' : 'bg-blue-100 text-blue-900'}`}>{msg}</div>
                  )
                })}
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
                <div className="flex gap-2 w-full">
                  <button onClick={() => toggleCategory("chat")} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${category === "chat" ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400" : "bg-white/50 text-gray-500 hover:bg-white"}`}>💬 吐槽/心情</button>
                  <button onClick={() => toggleCategory("activity")} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${category === "activity" ? "bg-green-100 text-green-700 ring-2 ring-green-400" : "bg-white/50 text-gray-500 hover:bg-white"}`}>🏀 约局/活动</button>
                </div>
                <div className="flex items-center space-x-2 bg-white/40 p-1.5 rounded-2xl border border-white/60">
                  <div className="relative flex-shrink-0 group">
                    <input type="text" value={icon} onChange={(e) => { const chars = Array.from(e.target.value); setIcon(chars.length > 0 ? chars[chars.length - 1] : ""); }} className="w-12 h-12 text-2xl text-center rounded-xl bg-white shadow-sm border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer placeholder-gray-300" placeholder="✍️" />
                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-sm pointer-events-none">自定义</div>
                  </div>
                  <div className="w-px h-6 bg-gray-300 mx-1"></div>
                  <div className="flex space-x-2 flex-1 overflow-x-auto scrollbar-hide py-1">
                    {['🍚', '📚', '🏀', '🎮', '🎤', '🏃', '🐱', '☕️'].map(emoji => (
                      <button key={emoji} onClick={() => setIcon(emoji)} className={`text-xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${icon === emoji ? 'bg-white shadow-md scale-110 border border-gray-100' : 'hover:bg-white/70'}`}>{emoji}</button>
                    ))}
                  </div>
                </div>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={category === "chat" ? "此时此刻想说点什么..." : "一缺三，速来（比如：二食堂开黑）..."} className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 shadow-inner" />
                {category === "activity" && (
                  <div className="flex gap-2 items-center w-full bg-green-50/80 p-2.5 rounded-xl border border-green-200 shadow-inner animate-in zoom-in-95">
                    <span className="text-xs text-green-700 font-bold whitespace-nowrap pl-1">活动时间:</span>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border-none p-1.5 rounded-lg bg-white text-sm flex-1 focus:ring-2 focus:ring-green-400 outline-none text-gray-700 shadow-sm" />
                    <span className="text-gray-400 text-xs">至</span>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border-none p-1.5 rounded-lg bg-white text-sm flex-1 focus:ring-2 focus:ring-green-400 outline-none text-gray-700 shadow-sm" />
                  </div>
                )}
                <div className="pt-1">
                  <p className="text-[11px] text-gray-400 mb-1.5 ml-1 font-medium">气泡将在多久后消失？</p>
                  <div className="flex bg-gray-100/50 p-1 rounded-xl gap-1">
                    {[{ label: "🚀 30m", val: 30 }, { label: "⏳ 2h", val: 120 }, { label: "📅 12h", val: 720 }].map((item) => (
                      <button key={item.val} onClick={() => setExpireMinutes(item.val)} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${expireMinutes === item.val ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>{item.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex space-x-3 mt-2">
                  <button onClick={resetForm} className="flex-1 py-3 bg-gray-200/50 hover:bg-gray-200/80 text-gray-700 font-semibold rounded-xl transition-colors">取消</button>
                  <button onClick={handleFlash} disabled={isSubmitting} className="flex-2 w-2/3 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-md transition-transform active:scale-95">{isSubmitting ? "发射中..." : "发射气泡"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
}
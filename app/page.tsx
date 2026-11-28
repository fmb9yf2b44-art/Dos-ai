"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, Copy, ImagePlus, Menu, Mic,
  MoreHorizontal, Plus, Search, Send, Sparkles, SquarePen, Trash2, X,
  Volume2, VolumeX, WandSparkles, MessageCircle, PanelLeftClose,
} from "lucide-react";

type Language = "en" | "ru" | "kk";
type Expression = "happy" | "thinking" | "talking" | "surprised" | "confused";
type Message = { id: string; role: "user" | "assistant"; text: string; time: number; image?: string; error?: boolean };
type Conversation = { id: string; title: string; updatedAt: number; messages: Message[] };
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = Event & { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechRecognitionEventLike) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const STORAGE_KEY = "dos-ai-conversations-v1";
const LANGS: Record<Language, { name: string; greeting: string; placeholder: string; tagline: string }> = {
  en: { name: "English", greeting: "What’s on your mind?", placeholder: "Ask anything...", tagline: "Your mind, in orbit." },
  ru: { name: "Русский", greeting: "О чём вы думаете?", placeholder: "Спросите о чём угодно...", tagline: "Твои мысли — на орбите." },
  kk: { name: "Қазақша", greeting: "Не туралы ойлап отырсың?", placeholder: "Кез келген нәрсені сұра...", tagline: "Ойың — ғарышта." },
};
const newId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const detectLanguage = (text: string): Language => /[әіңғүұқөһ]/i.test(text) ? "kk" : /[а-яё]/i.test(text) ? "ru" : "en";
const formatTime = (time: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(time));

function Azik({ expression, onClick }: { expression: Expression; onClick: () => void }) {
  return (
    <button className={`azik azik-${expression}`} onClick={onClick} aria-label={`AZIK is ${expression}. Click to say hello`} title="Meet AZIK">
      <span className="azik-orbit orbit-one" /><span className="azik-orbit orbit-two" />
      <span className="antenna"><i /></span>
      <span className="robot-head">
        <span className="head-shine" />
        <span className="robot-eye eye-left"><i /></span><span className="robot-eye eye-right"><i /></span>
        <span className="robot-cheek cheek-left" /><span className="robot-cheek cheek-right" />
        <span className="robot-mouth" />
      </span>
      <span className="robot-neck" />
      <span className="robot-body"><span className="chest-light" /><span className="body-mark">A</span></span>
      <span className="robot-arm arm-left"><i /></span><span className="robot-arm arm-right"><i /></span>
      <span className="robot-leg leg-left" /><span className="robot-leg leg-right" />
      <span className="robot-shadow" />
    </button>
  );
}

export default function Home() {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expression, setExpression] = useState<Expression>("happy");
  const [language, setLanguage] = useState<Language>("en");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeId) ?? null;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Conversation[];
        if (Array.isArray(parsed)) {
          setChats(parsed);
          setActiveId(parsed[0]?.id ?? null);
        }
      }
    } catch { setNotice("Saved chats could not be loaded. Your browser storage may be unavailable."); }
    setHydrated(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  useEffect(() => {
    if (hydrated) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }
      catch { setNotice("Browser storage is full. Please delete an old conversation."); }
    }
  }, [chats, hydrated]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeChat?.messages.length, busy]);
  useEffect(() => {
    const timer = notice ? window.setTimeout(() => setNotice(""), 5000) : undefined;
    return () => { if (timer) window.clearTimeout(timer); };
  }, [notice]);

  const makeChat = useCallback(() => {
    const chat: Conversation = { id: newId(), title: "New conversation", updatedAt: Date.now(), messages: [] };
    setChats((previous) => [chat, ...previous]); setActiveId(chat.id); setSidebarOpen(false); setText(""); setImage(null); setImageName("");
    window.setTimeout(() => textareaRef.current?.focus(), 30);
  }, []);

  const patchChat = (id: string, updater: (chat: Conversation) => Conversation) => {
    setChats((previous) => previous.map((chat) => chat.id === id ? updater(chat) : chat).sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const sendMessage = async (retryText?: string, retryImage?: string | null) => {
    const messageText = (retryText ?? text).trim();
    const messageImage = retryImage === undefined ? image : retryImage;
    if ((!messageText && !messageImage) || busy) return;
    const detected = detectLanguage(messageText || "Hello");
    setLanguage(detected);
    let conversation = activeChat;
    if (!conversation) {
      conversation = { id: newId(), title: "New conversation", updatedAt: Date.now(), messages: [] };
      setChats((previous) => [conversation!, ...previous]); setActiveId(conversation.id);
    }
    const userMessage: Message = { id: newId(), role: "user", text: messageText || "Please describe this image.", time: Date.now(), image: messageImage ?? undefined };
    const conversationId = conversation.id;
    const previousMessages = conversation.messages;
    const nextMessages = [...previousMessages, userMessage];
    const title = previousMessages.length === 0 ? (userMessage.text.slice(0, 38) || "Image question") : conversation.title;
    patchChat(conversationId, (chat) => ({ ...chat, title, messages: nextMessages, updatedAt: Date.now() }));
    setText(""); setImage(null); setImageName(""); setBusy(true); setExpression("thinking");
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: detected,
          messages: [...previousMessages, userMessage].slice(-30).map((message) => ({ role: message.role, text: message.text })),
          image: messageImage ?? undefined,
        }),
      });
      const payload = await response.json() as { text?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "The assistant is unavailable. Please try again.");
      if (!payload.text?.trim()) throw new Error("AZIK returned an empty answer. Please try again.");
      const assistant: Message = { id: newId(), role: "assistant", text: payload.text, time: Date.now() };
      patchChat(conversationId, (chat) => ({ ...chat, messages: [...chat.messages, assistant], updatedAt: Date.now() }));
      setExpression("talking"); window.setTimeout(() => setExpression("happy"), 1800);
    } catch (error) {
      const errText = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      const failed: Message = { id: newId(), role: "assistant", text: errText, time: Date.now(), error: true };
      patchChat(conversationId, (chat) => ({ ...chat, messages: [...chat.messages, failed], updatedAt: Date.now() }));
      setExpression("confused"); window.setTimeout(() => setExpression("happy"), 2400);
    } finally { setBusy(false); }
  };

  const retryMessage = (messageId: string) => {
    if (!activeChat) return;
    const index = activeChat.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const priorUser = [...activeChat.messages.slice(0, index)].reverse().find((message) => message.role === "user");
    if (!priorUser) return;
    patchChat(activeChat.id, (chat) => ({ ...chat, messages: chat.messages.filter((message) => message.id !== messageId), updatedAt: Date.now() }));
    void sendMessage(priorUser.text, priorUser.image ?? null);
  };

  const attachImage = (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { setNotice("Choose a JPG, PNG, WebP, or GIF image."); return; }
    if (file.size > 5 * 1024 * 1024) { setNotice("Images must be smaller than 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { setImage(reader.result); setImageName(file.name); } };
    reader.onerror = () => setNotice("Could not read that image. Please try another file.");
    reader.readAsDataURL(file);
  };

  const startVoice = () => {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setNotice("Voice input is not supported in this browser."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const recognition = new Recognition();
    recognition.lang = language === "kk" ? "kk-KZ" : language === "ru" ? "ru-RU" : "en-US";
    recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => { const result = event.results[0]?.[0]?.transcript; if (result) setText((current) => `${current}${current ? " " : ""}${result}`); };
    recognition.onerror = () => { setListening(false); setNotice("Microphone access failed. Check your browser permissions."); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); } catch { setNotice("Could not start voice input."); }
  };

  const speak = (message: Message) => {
    if (!("speechSynthesis" in window)) { setNotice("Text-to-speech is not supported in this browser."); return; }
    if (speakingId === message.id) { speechSynthesis.cancel(); setSpeakingId(null); return; }
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = language === "kk" ? "kk-KZ" : language === "ru" ? "ru-RU" : "en-US";
    utterance.onend = () => setSpeakingId(null); utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(message.id); speechSynthesis.speak(utterance);
  };

  const copyMessage = async (message: Message) => {
    try { await navigator.clipboard.writeText(message.text); setCopiedId(message.id); window.setTimeout(() => setCopiedId(null), 1500); }
    catch { setNotice("Clipboard access is unavailable in this browser."); }
  };

  const identity = language === "kk" ? "Мені Жандос жасаған! Ал менің көмекшімнің аты — Азик!" : language === "ru" ? "Меня создал Жандос! А моего помощника зовут Азик!" : "I was created by Жандос! My assistant's name is Azik!";
  const filteredChats = chats.filter((chat) => chat.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const submit = (event: React.FormEvent) => { event.preventDefault(); void sendMessage(); };

  return (
    <main className="app-shell">
      <div className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row"><a className="brand" href="#" onClick={(event) => event.preventDefault()}><span className="brand-mark"><Sparkles size={17} /></span><span>DOS<span className="brand-ai">AI</span></span></a><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><PanelLeftClose size={18} /></button></div>
        <button className="new-chat-button" onClick={makeChat}><SquarePen size={17} /><span>New chat</span><span className="shortcut">⌘ K</span></button>
        <div className="sidebar-tools"><span className="section-label">YOUR SPACE</span><button className="tool-button" onClick={() => setSearchOpen((open) => !open)}><Search size={16} /><span>Search chats</span></button>{searchOpen && <input className="search-input" autoFocus placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} />}</div>
        <div className="history-list"><span className="section-label history-label">RECENT</span>{filteredChats.length === 0 ? <p className="empty-history">Your conversations will appear here.</p> : filteredChats.map((chat) => <div key={chat.id} className={`history-item ${chat.id === activeId ? "history-active" : ""}`}><button className="history-select" onClick={() => { setActiveId(chat.id); setSidebarOpen(false); setMenuId(null); }} title={chat.title}><MessageCircle size={15} /><span>{renaming === chat.id ? <input className="rename-input" value={renameValue} autoFocus onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { patchChat(chat.id, (item) => ({ ...item, title: renameValue.trim() || item.title })); setRenaming(null); } if (event.key === "Escape") setRenaming(null); }} onBlur={() => { if (renameValue.trim()) patchChat(chat.id, (item) => ({ ...item, title: renameValue.trim() })); setRenaming(null); }} onClick={(event) => event.stopPropagation()} /> : chat.title}</span></button><button className="history-more" onClick={(event) => { event.stopPropagation(); setMenuId(menuId === chat.id ? null : chat.id); }} aria-label="Conversation options"><MoreHorizontal size={17} /></button>{menuId === chat.id && <div className="chat-menu"><button onClick={() => { setRenaming(chat.id); setRenameValue(chat.title); setMenuId(null); }}><SquarePen size={14} />Rename</button><button className="delete-action" onClick={() => { setChats((items) => items.filter((item) => item.id !== chat.id)); if (activeId === chat.id) setActiveId(chats.find((item) => item.id !== chat.id)?.id ?? null); setMenuId(null); }}><Trash2 size={14} />Delete</button></div>}</div>)}</div>
        <div className="sidebar-bottom"><div className="profile-chip"><div className="profile-avatar">Ж</div><div><strong>DOS AI</strong><span>Made for curious minds</span></div><span className="online-dot" /></div><div className="sidebar-footnote"><span className="status-dot" /> Gemini free tier <span className="footnote-separator">·</span><a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">limits apply</a></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={19} /></button><div className="mobile-brand"><span className="brand-mark"><Sparkles size={15} /></span>DOS AI</div><div className="model-pill"><span className="model-sparkle"><WandSparkles size={13} /></span>AZIK <span className="pill-divider" /> <span className="model-type">AI assistant</span><ChevronDown size={13} /></div></div><div className="topbar-right"><span className="secure-label"><span className="status-dot" /> Online</span><button className="icon-button top-new" onClick={makeChat} aria-label="New conversation"><Plus size={18} /></button></div></header>

        <div className={`chat-area ${activeChat?.messages.length ? "has-messages" : ""}`}>
          {!activeChat?.messages.length ? <div className="welcome-view"><div className="welcome-glow" /><div className="mascot-stage"><Azik expression={expression} onClick={() => setExpression("surprised")} /><span className="sparkle-float sparkle-a">✦</span><span className="sparkle-float sparkle-b">✧</span><span className="sparkle-float sparkle-c">·</span></div><div className="welcome-copy"><div className="eyebrow"><span className="eyebrow-line" /> MEET YOUR AI COMPANION <span className="eyebrow-line" /></div><h1>{LANGS[language].greeting}</h1><p>{LANGS[language].tagline}</p><div className="creator-note"><Sparkles size={13} />{identity}</div></div><div className="suggestions"><button onClick={() => { setText("Help me learn something new today"); textareaRef.current?.focus(); }}><span className="suggestion-icon violet"><Sparkles size={16} /></span><span><strong>Explore an idea</strong><small>Learn something new today</small></span><ArrowUp size={14} /></button><button onClick={() => { setText("Help me write a creative story"); textareaRef.current?.focus(); }}><span className="suggestion-icon blue"><WandSparkles size={16} /></span><span><strong>Create something</strong><small>Write, brainstorm, and dream</small></span><ArrowUp size={14} /></button><button onClick={() => { setText("Explain a complex topic simply"); textareaRef.current?.focus(); }}><span className="suggestion-icon pink"><MessageCircle size={16} /></span><span><strong>Understand anything</strong><small>Get a clear, thoughtful answer</small></span><ArrowUp size={14} /></button></div></div> : <div className="message-list">{activeChat.messages.map((message, index) => <article key={message.id} className={`message-row ${message.role === "user" ? "user-row" : "assistant-row"}`}><div className="message-avatar">{message.role === "assistant" ? <span className="mini-azik">A</span> : <span>Ж</span>}</div><div className="message-content"><div className="message-heading"><strong>{message.role === "assistant" ? "AZIK" : "You"}</strong><time>{formatTime(message.time)}</time></div>{message.image && <img className="message-image" src={message.image} alt="Your uploaded image" />}{message.role === "assistant" && busy && index === activeChat.messages.length - 1 ? <div className="typing-indicator"><i /><i /><i /><span>AZIK is thinking</span></div> : <p className={`message-text ${message.error ? "message-error" : ""}`}>{message.text}</p>}{message.role === "assistant" && !message.error && <div className="message-actions"><button onClick={() => void copyMessage(message)} aria-label="Copy message">{copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}<span>{copiedId === message.id ? "Copied" : "Copy"}</span></button><button onClick={() => speak(message)} aria-label="Read message aloud">{speakingId === message.id ? <VolumeX size={14} /> : <Volume2 size={14} />}<span>{speakingId === message.id ? "Stop" : "Read aloud"}</span></button><button onClick={() => retryMessage(message.id)} disabled={busy} aria-label="Retry response"><WandSparkles size={14} /><span>Retry</span></button></div>}{message.role === "assistant" && message.error && <button className="retry-error" onClick={() => retryMessage(message.id)}><WandSparkles size={14} /> Try again</button>}</div></article>)}{busy && <div className="typing-indicator global-typing"><span className="mini-azik">A</span><i /><i /><i /><span>AZIK is thinking</span></div>}<div ref={endRef} /></div>}
        </div>

        <div className="composer-wrap"><form className="composer" onSubmit={submit}><div className="composer-top">{image ? <div className="attachment-preview"><img src={image} alt="Selected upload preview" /><span>{imageName}</span><button type="button" onClick={() => { setImage(null); setImageName(""); }} aria-label="Remove image"><X size={14} /></button></div> : null}<textarea ref={textareaRef} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={LANGS[language].placeholder} rows={1} aria-label="Message AZIK" /></div><div className="composer-bottom"><div className="composer-tools"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => { attachImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /><button type="button" className="composer-tool" onClick={() => fileRef.current?.click()} aria-label="Upload image"><ImagePlus size={17} /><span>Attach</span></button><span className="tool-divider" /><button type="button" className={`composer-tool voice-tool ${listening ? "voice-listening" : ""}`} onClick={startVoice} aria-label={listening ? "Stop voice input" : "Start voice input"}><Mic size={16} /><span>{listening ? "Listening…" : "Voice"}</span></button></div><div className="send-wrap"><span className="enter-hint">Shift + Enter for a new line</span><button className="send-button" type="submit" disabled={busy || (!text.trim() && !image)} aria-label="Send message">{busy ? <span className="send-spinner" /> : <Send size={16} />}</button></div></div></form><div className="disclaimer"><span className="disclaimer-sparkle">✦</span> AZIK can make mistakes. Check important information. <span className="disclaimer-dot">·</span> Your chats stay on this device.</div></div>
      </section>
      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    </main>
  );
}

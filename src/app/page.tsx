"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import exifr from 'exifr';
import { Plus, Heart, MessageCircle, Upload, Loader2, LogOut, Trash2, Lock, Settings, X, PlayCircle, Download, Pencil, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, Timestamp, increment, limit } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import imageCompression from "browser-image-compression";

interface Comment {
  id: string;
  author: string;
  text: string;
  deviceId: string;
  createdAt: string;
}

interface Post {
  id: string;
  imageUrl: string;
  mediaType: 'image' | 'video';
  comment?: string | null;
  author?: string;
  createdAt?: Timestamp | null;
  captureDate?: Timestamp | null;
  likes?: string[];
  comments?: Comment[];
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);

  // 방문 통계 (관리자 전용)
  const [visitStats, setVisitStats] = useState<{ date: string; count: number }[]>([]);
  const visitCountedRef = useRef(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [appConfig, setAppConfig] = useState({ babyName: "루미", birthDate: "2026-01-01" });
  
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempDate, setTempDate] = useState("");

  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slideKey, setSlideKey] = useState(0);

  // Community State
  const [deviceId, setDeviceId] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("");
  const [newComment, setNewComment] = useState("");
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);

  // Init Device ID and Name
  useEffect(() => {
    let storedId = localStorage.getItem("rumi_device_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem("rumi_device_id", storedId);
    }
    setDeviceId(storedId);

    const storedName = localStorage.getItem("rumi_guest_name");
    if (storedName) setGuestName(storedName);
  }, []);

  // Android Back button: close lightbox instead of exiting app
  useEffect(() => {
    if (lightboxPost) {
      history.pushState({ lightbox: true }, "");
      const handlePop = () => {
        setLightboxPost(null);
      };
      window.addEventListener("popstate", handlePop);
      return () => window.removeEventListener("popstate", handlePop);
    }
  }, [lightboxPost]);

  // Authentication Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingContext(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Config (설정은 자주 바뀌지 않으므로 1회 fetch)
  useEffect(() => {
    getDoc(doc(db, "config", "main")).then(docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAppConfig({ babyName: data.babyName || "루미", birthDate: data.birthDate || "2026-01-01" });
      }
    });
  }, []);

  // Firestore Posts Snapshot
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("captureDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Post));
      setPosts(postsData);
    });
    return () => unsubscribe();
  }, []);

  // 방문 카운트: 로드당 1회 +1 (관리자 본인 접속은 제외)
  useEffect(() => {
    if (loadingContext) return;      // 인증 상태 확정 전엔 대기
    if (user) return;                // 관리자 방문은 집계 제외
    if (visitCountedRef.current) return;
    visitCountedRef.current = true;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setDoc(doc(db, "visits", todayKey), { count: increment(1), date: todayKey }, { merge: true })
      .catch((err) => console.error("방문 집계 실패:", err));
  }, [loadingContext, user]);

  // 방문 통계 조회: 관리자 로그인 시에만 (최근 7일, 실시간)
  useEffect(() => {
    if (!user) { setVisitStats([]); return; }
    const q = query(collection(db, "visits"), orderBy("date", "desc"), limit(7));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVisitStats(snapshot.docs.map(d => ({ date: d.id, count: d.data().count || 0 })));
    }, (err) => console.error("방문 통계 조회 실패:", err));
    return () => unsubscribe();
  }, [user]);

  // Set default selected month automatically
  useEffect(() => {
    if (posts.length > 0 && !selectedMonth) {
      let d = new Date();
      if (posts[0].captureDate?.toDate) d = posts[0].captureDate.toDate();
      else if (posts[0].createdAt?.toDate) d = posts[0].createdAt.toDate();
      setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [posts, selectedMonth]);

  const groupedPosts = useMemo(() => {
    const groups: Record<string, Post[]> = {};
    posts.forEach(p => {
      let d = new Date();
      if (p.captureDate && p.captureDate.toDate) d = p.captureDate.toDate();
      else if (p.createdAt && p.createdAt.toDate) d = p.createdAt.toDate();
      
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  }, [posts]);

  const availableMonths = useMemo(() => {
    return Object.keys(groupedPosts).sort().reverse();
  }, [groupedPosts]);

  const currentMonthPosts = useMemo(() => {
    return groupedPosts[selectedMonth] || [];
  }, [groupedPosts, selectedMonth]);

  const activeLightboxPost = useMemo(() => {
    if (!lightboxPost) return null;
    return posts.find(p => p.id === lightboxPost.id) || lightboxPost;
  }, [posts, lightboxPost]);

  // 최근 7일 방문 통계 (없는 날은 0으로 채움)
  const recentVisitDays = useMemo(() => {
    const counts: Record<string, number> = {};
    visitStats.forEach(v => { counts[v.date] = v.count; });
    const days: { date: string; label: string; count: number; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ date: key, label: `${d.getMonth() + 1}/${d.getDate()}`, count: counts[key] || 0, isToday: i === 0 });
    }
    return days;
  }, [visitStats]);

  const todayVisits = recentVisitDays[recentVisitDays.length - 1]?.count ?? 0;
  const maxVisits = Math.max(1, ...recentVisitDays.map(d => d.count));

  // Swipe navigation for lightbox (전체 사진 대상)
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const getPostMonth = (post: Post) => {
    let d = new Date();
    if (post.captureDate?.toDate) d = post.captureDate.toDate();
    else if (post.createdAt?.toDate) d = post.createdAt.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const isNewPost = (post: Post) => {
    if (!post.createdAt) return false;
    const timeMillis = post.createdAt?.toMillis ? post.createdAt.toMillis() : (post.createdAt?.seconds ? post.createdAt.seconds * 1000 : 0);
    if (!timeMillis) return false;
    const diffHours = (Date.now() - timeMillis) / (1000 * 60 * 60);
    return diffHours <= 72;
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (!activeLightboxPost) return;
    const idx = posts.findIndex((p: Post) => p.id === activeLightboxPost.id);
    if (idx === -1) return;
    let targetPost = null;
    if (direction === 'next' && idx < posts.length - 1) {
      targetPost = posts[idx + 1];
    } else if (direction === 'prev' && idx > 0) {
      targetPost = posts[idx - 1];
    }
    if (targetPost) {
      setSlideDirection(direction === 'next' ? 'left' : 'right');
      setSlideKey(prev => prev + 1);
      setLightboxPost(targetPost);
      setEditingCaption(false);
      // 다른 월 사진이면 탭도 자동 전환
      const targetMonth = getPostMonth(targetPost);
      if (targetMonth !== selectedMonth) setSelectedMonth(targetMonth);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isZoomed) return; // 확대 중일 때는 패닝을 위해 스와이프 무시
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX < 0) navigateLightbox('next');
      else navigateLightbox('prev');
    }
  };

  const heroPost = currentMonthPosts.length > 0 ? currentMonthPosts[0] : null;
  const gridPosts = currentMonthPosts.length > 1 ? currentMonthPosts.slice(1) : [];

  // Calculation for Baby Age
  const getAgeString = (targetDate: Date) => {
    try {
      const birth = new Date(appConfig.birthDate);
      const diffTime = targetDate.getTime() - birth.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24))) + 1;
      
      const years = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      
      if (years > 0 && months > 0) return `${appConfig.babyName} 출생일로부터 ${years}년 ${months}개월 (${diffDays}일)`;
      if (years > 0) return `${appConfig.babyName} 출생일로부터 ${years}년 (${diffDays}일)`;
      if (months > 0) return `${appConfig.babyName} 출생일로부터 ${months}개월 (${diffDays}일)`;
      return `${appConfig.babyName} 출생일로부터 ${diffDays}일`;
    } catch {
      return "";
    }
  };

  const currentYearStr = selectedMonth ? selectedMonth.split("-")[0] : new Date().getFullYear().toString();

  const handleSaveConfig = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "config", "main"), { babyName: tempName, birthDate: tempDate }, { merge: true });
      setSettingsOpen(false);
    } catch (err) {
      alert("저장 실패: " + (err as FirebaseError).message);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return alert("사진을 선택해주세요.");
    if (!user) return alert("로그인이 필요합니다.");

    setUploading(true);
    try {
      await Promise.all(
        files.map(async (f) => {
          let captureDate = new Date();
          if (f.type.startsWith("image/")) {
            try {
              const exifData = await exifr.parse(f);
              if (exifData?.DateTimeOriginal) {
                captureDate = new Date(exifData.DateTimeOriginal);
              } else if (f.lastModified) {
                captureDate = new Date(f.lastModified);
              }
            } catch {
              if (f.lastModified) captureDate = new Date(f.lastModified);
            }
          } else {
            if (f.lastModified) captureDate = new Date(f.lastModified);
          }

          const fileToUpload = f.type.startsWith("image/")
            ? await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
            : f;

          const storageRef = ref(storage, `posts/${Date.now()}_${Math.random().toString(36).substring(7)}_${f.name}`);
          const snapshot = await uploadBytes(storageRef, fileToUpload);
          const downloadUrl = await getDownloadURL(snapshot.ref);

          await addDoc(collection(db, "posts"), {
            imageUrl: downloadUrl,
            mediaType: f.type.startsWith("video/") ? "video" : "image",
            comment: comment,
            author: user.email?.split("@")[0] || "가족",
            createdAt: serverTimestamp(),
            captureDate: captureDate,
          });
        })
      );

      setUploadOpen(false);
      setFiles([]);
      setComment("");
    } catch (err) {
      alert("업로드 실패: " + (err as FirebaseError).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (postId: string, imageUrl: string) => {
    if (!user) return;
    if (window.confirm("정말 이 사진을 삭제할까요?\n(복구할 수 없습니다)")) {
      try {
        await deleteDoc(doc(db, "posts", postId));
        setLightboxPost(null);
      } catch (err) {
        alert("삭제 실패: " + (err as FirebaseError).message);
        return;
      }

      if (imageUrl) {
        try {
          await deleteObject(ref(storage, imageUrl));
        } catch (storageErr) {
          const code = (storageErr as FirebaseError).code;
          if (code !== "storage/object-not-found") {
            console.error("Storage 파일 삭제 실패 (Firestore는 이미 삭제됨):", storageErr);
          }
        }
      }
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!deviceId) return;
    const postRef = doc(db, "posts", post.id);
    const hasLiked = post.likes && post.likes.includes(deviceId);
    try {
       await updateDoc(postRef, {
         likes: hasLiked ? arrayRemove(deviceId) : arrayUnion(deviceId)
       });
    } catch (e) { console.error(e); }
  };

  const handleAddComment = async (post: Post) => {
    if (!guestName.trim()) return alert("이름을 입력해주세요.");
    if (!newComment.trim()) return alert("댓글 내용을 입력해주세요.");

    localStorage.setItem("rumi_guest_name", guestName.trim());
    const postRef = doc(db, "posts", post.id);
    const commentObj = {
       id: Math.random().toString(36).substring(2, 15),
       author: guestName.trim(),
       text: newComment.trim(),
       deviceId: deviceId,
       createdAt: new Date().toISOString()
    };

    try {
      await updateDoc(postRef, {
         comments: arrayUnion(commentObj)
      });
      setNewComment("");
    } catch { }
  };

  const handleDeleteComment = async (post: Post, commentObj: Comment) => {
    if (window.confirm("댓글을 삭제하시겠습니까?")) {
      const postRef = doc(db, "posts", post.id);
      try {
        await updateDoc(postRef, {
           comments: arrayRemove(commentObj)
        });
      } catch { }
    }
  };

  const handleDownload = async (url: string, mediaType: string) => {
    if (!window.confirm("원본 파일을 기기에 다운로드 하시겠습니까?")) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response error");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `rumi_photo_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // CORS 등으로 fetch 실패 시, 안전하게 새 창에서 열기 방식(Fallback)
      const link = document.createElement('a');
      link.href = url;
      link.target = "_blank";
      link.download = `rumi_photo_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (loadingContext) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-white min-h-screen text-black relative pb-24 font-sans">
      
      {/* Header Panel */}
      <header className="sticky top-0 z-30 w-full max-w-md bg-white border-b border-zinc-200">
        <div className="flex justify-between items-center px-4 py-3">
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-tight">Rumi World</span>
            <span className="text-xs text-rose-600 font-semibold mt-1 bg-rose-50 px-2 py-0.5 rounded-full self-start">{getAgeString(new Date())}</span>
          </div>
          <div className="flex items-center gap-4 text-zinc-600">
            {user ? (
              <>
                <button onClick={() => { setTempName(appConfig.babyName); setTempDate(appConfig.birthDate); setSettingsOpen(true); }}><Settings className="w-6 h-6" /></button>
                <button onClick={() => signOut(auth)}><LogOut className="w-6 h-6" /></button>
              </>
            ) : (
              <button onClick={() => router.push("/login")}><Lock className="w-6 h-6" /></button>
            )}
          </div>
        </div>

        {/* Month Tabs */}
        {availableMonths.length > 0 && (
          <div className="flex overflow-x-auto hide-scrollbar border-t border-zinc-100">
            <div className="flex px-2 w-full gap-4 relative items-center">
              <span className="text-xs text-zinc-400 font-semibold pl-2 shrink-0">{currentYearStr}년</span>
              {availableMonths.map((m) => {
                const monthNum = parseInt(m.split("-")[1], 10);
                const isActive = selectedMonth === m;
                return (
                  <button 
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    className={`whitespace-nowrap px-4 py-3 font-semibold transition-colors relative ${isActive ? 'text-rose-500' : 'text-zinc-400'}`}
                  >
                    {monthNum}월
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500 mx-1 rounded-t-sm" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex flex-col w-full max-w-md">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-zinc-400 gap-4">
            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-zinc-300" />
            </div>
            <p className="font-medium text-zinc-500">아직 등록된 사진이 없습니다.</p>
          </div>
        ) : (
          <>
            {/* Hero Profile Image */}
            {heroPost && (
              <div 
                className="w-full aspect-[4/5] relative bg-zinc-200 cursor-pointer overflow-hidden group"
                onClick={() => setLightboxPost(heroPost)}
              >
                {heroPost.mediaType === "video" ? (
                  <video src={heroPost.imageUrl} muted playsInline autoPlay loop preload="metadata" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <img src={heroPost.imageUrl} alt="Hero" fetchPriority="high" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}

                {/* New Badge */}
                {isNewPost(heroPost) && (
                  <div className="absolute top-3 left-3 bg-rose-500/90 backdrop-blur-sm px-2 h-5 rounded-full z-10 shadow-sm border border-white/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white tracking-widest leading-none mb-[1px]">NEW</span>
                  </div>
                )}
                
                {/* Overlay Text */}
                <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-6 pointer-events-none">
                  <div className="flex justify-between items-end w-full">
                    <div className="flex flex-col text-white drop-shadow-md">
                       <span className="text-lg font-bold opacity-90 mb-0.5">{currentYearStr}</span>
                       <span className="text-5xl font-light tracking-wide mb-1">{new Date(selectedMonth).toLocaleString('en-US', { month: 'long' })}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Grid Gallery */}
            {gridPosts.length > 0 && (
              <div className="grid grid-cols-3 gap-[2px] mt-[2px]">
                {gridPosts.map(post => (
                  <div 
                    key={post.id} 
                    className="aspect-square bg-zinc-200 cursor-pointer relative group overflow-hidden"
                    onClick={() => setLightboxPost(post)}
                  >
                    {post.mediaType === "video" ? (
                      <>
                        <video src={`${post.imageUrl}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                        <div className="absolute top-2 right-2 text-white drop-shadow-md">
                          <PlayCircle className="w-6 h-6 opacity-90 drop-shadow-xl" />
                        </div>
                      </>
                    ) : (
                      <img src={post.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                    )}
                    
                    {/* New Badge */}
                    {isNewPost(post) && (
                      <div className="absolute top-2 left-2 bg-rose-500/90 backdrop-blur-sm w-[18px] h-[18px] rounded-full z-10 shadow-sm border border-white/20 flex items-center justify-center pointer-events-none">
                        <span className="text-[9px] font-bold text-white leading-none mb-[1px]">N</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Action Button */}
      {user && (
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600 transition-colors">
            <Plus className="h-6 w-6 font-bold" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-md w-[90vw] mx-auto rounded-3xl bg-white border border-zinc-200 text-black shadow-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl">새 사진 올리기</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-6 py-4">
              <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 transition-colors relative overflow-hidden">
                {files.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto w-full h-full p-2 bg-zinc-800 absolute inset-0 items-center hide-scrollbar">
                    {files.map((f, i) => {
                      const isVideo = f.type.startsWith("video/");
                      const fileUrl = URL.createObjectURL(f);
                      return isVideo ? (
                        <div key={i} className="h-full auto aspect-square relative flex-shrink-0">
                          <video src={fileUrl} className="w-full h-full object-cover rounded-md" />
                          <PlayCircle className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-white drop-shadow-xl opacity-90" />
                        </div>
                      ) : (
                        <img key={i} src={fileUrl} alt={`preview-${i}`} className="h-full auto aspect-square object-cover rounded-md flex-shrink-0" />
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-400">
                    <Upload className="mb-3 h-8 w-8" />
                    <p className="font-medium">사진 및 동영상 선택</p>
                  </div>
                )}
                <Input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </label>
              <Textarea
                placeholder="코멘트를 남겨주세요."
                className="bg-white border-zinc-200 resize-none h-24 text-base"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button disabled={uploading || files.length === 0} className="w-full bg-rose-500 text-white hover:bg-rose-600 py-6 rounded-xl text-lg font-bold font-sans" onClick={handleUpload}>
                {uploading ? <Loader2 className="animate-spin" /> : `${files.length > 0 ? `${files.length}장 ` : ''}업로드`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] mx-auto rounded-3xl bg-white text-black p-6">
          <DialogHeader><DialogTitle>아기 정보 설정</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
               <Label>이름 (태명)</Label>
               <Input value={tempName} onChange={e => setTempName(e.target.value)} placeholder="루미" />
            </div>
            <div className="flex flex-col gap-2">
               <Label>생년월일 (YYYY-MM-DD)</Label>
               <Input value={tempDate} onChange={e => setTempDate(e.target.value)} placeholder="2026-01-01" type="date" />
            </div>

            {/* 방문 통계 (관리자 전용) */}
            <div className="mt-2 pt-4 border-t border-zinc-200">
              <div className="flex items-center justify-between mb-3">
                <Label className="m-0">방문 통계</Label>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400"><Lock className="w-3 h-3" />나만 보임</span>
              </div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-rose-500 leading-none">{todayVisits}</span>
                <span className="text-sm text-zinc-500 font-medium">오늘 접속</span>
              </div>
              {/* 최근 7일 */}
              <div className="flex items-end justify-between gap-1.5 h-20">
                {recentVisitDays.map(d => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-zinc-600 leading-none">{d.count}</span>
                    <div className="flex w-full items-end justify-center" style={{ height: "44px" }}>
                      <div
                        className={`w-full rounded-t-sm ${d.isToday ? "bg-rose-500" : "bg-rose-200"}`}
                        style={{ height: `${Math.max(3, (d.count / maxVisits) * 44)}px` }}
                      />
                    </div>
                    <span className={`text-[9px] leading-none ${d.isToday ? "font-bold text-rose-500" : "text-zinc-400"}`}>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveConfig} className="w-full bg-zinc-900 text-white hover:bg-zinc-800 py-6 rounded-xl text-md">저장하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Viewer */}
      {activeLightboxPost && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col text-white animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-4 min-h-16">
            <button onClick={() => setLightboxPost(null)} className="p-2 text-zinc-300 hover:text-white"><X className="w-8 h-8" /></button>
            <span className="text-sm font-medium text-zinc-400">
               {activeLightboxPost.captureDate?.toDate 
                 ? activeLightboxPost.captureDate.toDate().toLocaleDateString() 
                 : (activeLightboxPost.createdAt?.toDate ? activeLightboxPost.createdAt.toDate().toLocaleDateString() : "")}
            </span>
            <div className="w-10 flex justify-end">
              {user && (
                <button onClick={() => handleDelete(activeLightboxPost.id, activeLightboxPost.imageUrl)} className="p-2 text-zinc-400 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <div 
            className="flex-1 flex items-center justify-center p-0 overflow-hidden relative bg-black"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              key={slideKey}
              className={`w-full h-full flex items-center justify-center ${
                slideDirection === 'left' ? 'animate-slide-in-left' :
                slideDirection === 'right' ? 'animate-slide-in-right' : ''
              }`}
              onAnimationEnd={() => setSlideDirection(null)}
            >
              {activeLightboxPost.mediaType === "video" ? (
                <video src={activeLightboxPost.imageUrl} controls playsInline autoPlay className="w-full h-auto max-h-full object-contain" />
              ) : (
                <TransformWrapper
                  initialScale={1}
                  minScale={1}
                  maxScale={4}
                  pinch={{ step: 5 }}
                  doubleClick={{ step: 0.5 }}
                  onTransform={(ref) => setIsZoomed(ref.state.scale > 1.05)}
                >
                  {() => (
                    <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full !flex !items-center !justify-center">
                      <img src={activeLightboxPost.imageUrl} alt="" decoding="async" className="w-full h-auto max-h-full object-contain select-none" draggable={false} />
                    </TransformComponent>
                  )}
                </TransformWrapper>
              )}
            </div>
            {/* 위치 카운터 */}
            {posts.length > 1 && (() => {
              const idx = posts.findIndex((p: Post) => p.id === activeLightboxPost.id);
              return (
                <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-zinc-400 font-medium">
                  {idx + 1} / {posts.length}
                </span>
              );
            })()}
          </div>
          <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
             <div className="flex gap-3 items-center mb-4">
               <button onClick={() => handleToggleLike(activeLightboxPost)} className="active:scale-110 transition-transform">
                 {activeLightboxPost.likes?.includes(deviceId) ? (
                   <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
                 ) : (
                   <Heart className="w-6 h-6 text-zinc-100" />
                 )}
               </button>
               {(activeLightboxPost.likes?.length ?? 0) > 0 && <span className="text-zinc-100 font-semibold">{activeLightboxPost.likes?.length}</span>}

               <MessageCircle className="w-6 h-6 text-zinc-100 ml-3" />
               {(activeLightboxPost.comments?.length ?? 0) > 0 && <span className="text-zinc-100 font-semibold">{activeLightboxPost.comments?.length}</span>}
               
               <button onClick={() => handleDownload(activeLightboxPost.imageUrl, activeLightboxPost.mediaType)} className="ml-auto flex items-center gap-1 text-zinc-100 hover:text-white active:scale-95 transition-transform">
                 <Download className="w-6 h-6" />
                 <span className="text-sm font-medium sr-only">다운로드</span>
               </button>
             </div>
             {/* 업로드 코멘트 (관리자: 터치하면 편집 / 없으면 추가 버튼) */}
              {editingCaption ? (
                <div className="flex gap-2 items-end mb-4">
                  <textarea
                    className="flex-1 bg-zinc-800/80 text-white text-sm rounded-lg p-2 border border-zinc-600 focus:outline-none focus:border-zinc-400 resize-none min-h-[60px]"
                    value={captionText}
                    onChange={e => setCaptionText(e.target.value)}
                    placeholder="코멘트를 입력해주세요..."
                    autoFocus
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={async () => {
                        await updateDoc(doc(db, "posts", activeLightboxPost.id), { comment: captionText.trim() || null });
                        setEditingCaption(false);
                      }}
                      className="rounded-full bg-rose-500 hover:bg-rose-600 w-8 h-8 flex items-center justify-center transition-colors"
                    >
                      <Check className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => setEditingCaption(false)}
                      className="rounded-full bg-zinc-700 hover:bg-zinc-600 w-8 h-8 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              ) : activeLightboxPost.comment ? (
                <p
                  className={`text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed mb-4 ${user ? 'cursor-pointer active:bg-zinc-800/50 rounded-lg -mx-1 px-1 py-0.5 transition-colors' : ''}`}
                  onClick={() => { if (user) { setCaptionText(activeLightboxPost.comment ?? ""); setEditingCaption(true); } }}
                >
                  <span className="font-semibold mr-2">{activeLightboxPost.author}</span>
                  {activeLightboxPost.comment}
                  {user && <Pencil className="w-3 h-3 text-zinc-500 inline ml-2" />}
                </p>
              ) : user ? (
                <button
                  onClick={() => { setCaptionText(""); setEditingCaption(true); }}
                  className="text-sm text-zinc-500 hover:text-zinc-300 mb-4 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  코멘트 추가
                </button>
              ) : null}
             
             {/* Comments List */}
             {activeLightboxPost.comments && activeLightboxPost.comments.length > 0 && (
               <div className="flex flex-col gap-2 max-h-32 overflow-y-auto hide-scrollbar mb-4 border-l-2 border-zinc-800 pl-3">
                 {activeLightboxPost.comments.map((c: Comment) => (
                   <div key={c.id} className="flex justify-between items-start text-sm">
                     <p className="text-zinc-300">
                       <span className="font-semibold text-zinc-100 mr-2">{c.author}</span>
                       {c.text}
                     </p>
                     {(c.deviceId === deviceId || user) && (
                       <button onClick={() => handleDeleteComment(activeLightboxPost, c)} className="text-zinc-500 hover:text-red-400 ml-2 mt-0.5">
                         <X className="w-4 h-4" />
                       </button>
                     )}
                   </div>
                 ))}
               </div>
             )}

             {/* Add Comment Input */}
             <div className="flex gap-2 items-center mt-2 border border-zinc-700 bg-black/40 rounded-full py-1 pl-3 pr-1 shadow-sm focus-within:border-zinc-500 transition-colors">
               <input 
                 className="bg-transparent text-white w-20 text-sm focus:outline-none border-r border-zinc-700 pr-2 placeholder-zinc-500 font-medium shrink-0"
                 placeholder="이름"
                 value={guestName}
                 onChange={e => setGuestName(e.target.value)}
               />
               <input 
                 className="bg-transparent text-white flex-1 min-w-0 text-sm focus:outline-none px-2 placeholder-zinc-500"
                 placeholder="루미 예뻐요..."
                 value={newComment}
                 onChange={e => setNewComment(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleAddComment(activeLightboxPost)}
               />
               <button onClick={() => handleAddComment(activeLightboxPost)} className="rounded-full bg-rose-500 hover:bg-rose-600 transition-colors w-8 h-8 flex items-center justify-center shrink-0">
                 <Upload className="w-4 h-4 text-white" />
               </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}

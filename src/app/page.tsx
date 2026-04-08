"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Heart, MessageCircle, Share2, Upload, Loader2, LogOut, Trash2, Lock, Settings, X, Search, MoreVertical, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  
  const [posts, setPosts] = useState<any[]>([]);
  const [appConfig, setAppConfig] = useState({ babyName: "루미", birthDate: "2026-01-01" });
  
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempDate, setTempDate] = useState("");

  const [lightboxPost, setLightboxPost] = useState<any | null>(null);

  // Authentication Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingContext(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Config Snapshot
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "config", "main"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAppConfig({ babyName: data.babyName || "루미", birthDate: data.birthDate || "2026-01-01" });
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Posts Snapshot
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setPosts(postsData);
    });
    return () => unsubscribe();
  }, []);

  // Set default selected month automatically
  useEffect(() => {
    if (posts.length > 0 && !selectedMonth) {
      const firstPostDate = posts[0].createdAt?.toDate ? posts[0].createdAt.toDate() : new Date();
      setSelectedMonth(`${firstPostDate.getFullYear()}-${String(firstPostDate.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [posts, selectedMonth]);

  const groupedPosts = useMemo(() => {
    const groups: Record<string, any[]> = {};
    posts.forEach(p => {
      const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date();
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

  const heroPost = currentMonthPosts.length > 0 ? currentMonthPosts[0] : null;
  const gridPosts = currentMonthPosts.length > 1 ? currentMonthPosts.slice(1) : [];

  // Calculation for Baby Age
  const getAgeString = (targetDate: Date) => {
    try {
      const birth = new Date(appConfig.birthDate);
      const diffTime = targetDate.getTime() - birth.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      
      const years = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      
      if (years > 0 && months > 0) return `${appConfig.babyName} 출생일로부터 ${years}년 ${months}개월`;
      if (years > 0) return `${appConfig.babyName} 출생일로부터 ${years}년`;
      if (months > 0) return `${appConfig.babyName} 출생일로부터 ${months}개월`;
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
    } catch (err: any) {
      alert("저장 실패: " + err.message);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return alert("사진을 선택해주세요.");
    if (!user) return alert("로그인이 필요합니다.");

    setUploading(true);
    try {
      await Promise.all(
        files.map(async (f) => {
          const storageRef = ref(storage, `posts/${Date.now()}_${Math.random().toString(36).substring(7)}_${f.name}`);
          const snapshot = await uploadBytes(storageRef, f);
          const downloadUrl = await getDownloadURL(snapshot.ref);

          await addDoc(collection(db, "posts"), {
            imageUrl: downloadUrl,
            mediaType: f.type.startsWith("video/") ? "video" : "image",
            comment: comment,
            author: user.email?.split("@")[0] || "가족",
            createdAt: serverTimestamp(),
          });
        })
      );

      setUploadOpen(false);
      setFiles([]);
      setComment("");
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (postId: string, imageUrl: string) => {
    if (!user) return;
    if (window.confirm("정말 이 사진을 삭제할까요?\n(복구할 수 없습니다)")) {
      try {
        if (imageUrl) {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        }
        await deleteDoc(doc(db, "posts", postId));
        setLightboxPost(null);
      } catch (err: any) {
        alert("삭제 실패: " + err.message);
      }
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
      <header className="sticky top-0 z-10 w-full max-w-md bg-white border-b border-zinc-200">
        <div className="flex justify-between items-center px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden">
               <span className="font-bold text-lg text-zinc-700">R</span>
            </div>
            <span className="text-xl font-bold tracking-tight">{currentYearStr}</span>
          </div>
          <div className="flex items-center gap-4 text-zinc-600">
            <Search className="w-6 h-6" />
            {user ? (
              <>
                <button onClick={() => { setTempName(appConfig.babyName); setTempDate(appConfig.birthDate); setSettingsOpen(true); }}><Settings className="w-6 h-6" /></button>
                <button onClick={() => signOut(auth)}><LogOut className="w-6 h-6" /></button>
              </>
            ) : (
              <button onClick={() => router.push("/login")}><Lock className="w-6 h-6" /></button>
            )}
            <MoreVertical className="w-6 h-6" />
          </div>
        </div>

        {/* Month Tabs */}
        {availableMonths.length > 0 && (
          <div className="flex overflow-x-auto hide-scrollbar border-t border-zinc-100">
            <div className="flex px-2 w-full gap-4 relative">
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
                  <video src={heroPost.imageUrl} muted playsInline autoPlay loop className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <img src={heroPost.imageUrl} alt="Hero" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                
                {/* Overlay Text */}
                <div className="absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-6 pointer-events-none">
                  <div className="flex justify-between items-end w-full">
                    <div className="flex flex-col text-white drop-shadow-md">
                       <span className="text-5xl font-light tracking-wide mb-1">{new Date(selectedMonth).toLocaleString('en-US', { month: 'long' })}</span>
                       <span className="text-lg font-bold opacity-90">{currentYearStr}</span>
                       <span className="mt-6 text-sm font-medium opacity-95">
                         {getAgeString(heroPost.createdAt?.toDate ? heroPost.createdAt.toDate() : new Date())}
                       </span>
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
                        <video src={post.imageUrl} muted playsInline className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                        <div className="absolute top-2 right-2 text-white drop-shadow-md">
                          <PlayCircle className="w-6 h-6 opacity-90 drop-shadow-xl" />
                        </div>
                      </>
                    ) : (
                      <img src={post.imageUrl} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
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
          </div>
          <DialogFooter>
            <Button onClick={handleSaveConfig} className="w-full bg-zinc-900 text-white hover:bg-zinc-800 py-6 rounded-xl text-md">저장하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Viewer */}
      {lightboxPost && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col text-white animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-4 min-h-16">
            <button onClick={() => setLightboxPost(null)} className="p-2 text-zinc-300 hover:text-white"><X className="w-8 h-8" /></button>
            <span className="text-sm font-medium text-zinc-400">
               {lightboxPost.createdAt?.toDate ? lightboxPost.createdAt.toDate().toLocaleDateString() : ""}
            </span>
            <div className="w-10 flex justify-end">
              {user && (
                <button onClick={() => handleDelete(lightboxPost.id, lightboxPost.imageUrl)} className="p-2 text-zinc-400 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-0 overflow-hidden relative bg-black">
            {lightboxPost.mediaType === "video" ? (
              <video src={lightboxPost.imageUrl} controls playsInline autoPlay className="w-full h-auto max-h-full object-contain" />
            ) : (
              <img src={lightboxPost.imageUrl} className="w-full h-auto max-h-full object-contain" />
            )}
          </div>
          <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
             <div className="flex gap-4 mb-4">
               <Heart className="w-6 h-6 text-zinc-100" />
               <MessageCircle className="w-6 h-6 text-zinc-100" />
               <Share2 className="w-6 h-6 text-zinc-100" />
             </div>
             {lightboxPost.comment && (
                 <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                   <span className="font-semibold mr-2">{lightboxPost.author}</span>
                   {lightboxPost.comment}
                 </p>
             )}
          </div>
        </div>
      )}

    </div>
  );
}

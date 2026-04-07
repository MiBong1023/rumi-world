"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Heart, MessageCircle, Share2, Upload, Loader2, LogOut, Trash2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  
  const [posts, setPosts] = useState<any[]>([]);
  
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);

  // Authentication Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingContext(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Snapshot Listener
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

  const handleDelete = async (postId: string, imageUrl: string) => {
    if (!user) return;
    if (window.confirm("정말 이 사진을 삭제할까요?\n(복구할 수 없습니다)")) {
      try {
        if (imageUrl) {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        }
        await deleteDoc(doc(db, "posts", postId));
      } catch (err: any) {
        alert("삭제 실패: " + err.message);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("사진을 선택해주세요.");
    if (!user) return alert("로그인이 필요합니다.");

    setUploading(true);
    try {
      // 1. Upload to Storage
      const storageRef = ref(storage, `posts/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // 2. Save metadata to Firestore
      await addDoc(collection(db, "posts"), {
        imageUrl: downloadUrl,
        comment: comment,
        author: user.email?.split("@")[0] || "가족",
        createdAt: serverTimestamp(),
      });

      // Reset Modal State
      setOpen(false);
      setFile(null);
      setComment("");
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loadingContext) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-black min-h-screen text-zinc-50 relative pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 w-full max-w-md bg-black/85 backdrop-blur-md border-b border-zinc-800 p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-wider">RUMI WORLD</h1>
        {user ? (
          <button onClick={() => signOut(auth)} className="text-zinc-400 hover:text-white transition-colors" title="로그아웃">
            <LogOut className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={() => router.push("/login")} className="text-zinc-600 hover:text-white transition-colors" title="관리자 로그인">
            <Lock className="w-5 h-5" />
          </button>
        )}
      </header>

      {/* Main Feed */}
      <main className="flex flex-col w-full max-w-md gap-6 p-4">
        {posts.length === 0 ? (
          <div className="text-center text-zinc-500 py-20">
            <p>아직 등록된 사진이 없습니다.</p>
            <p className="text-sm">우측 하단 버튼을 눌러 첫 추억을 남겨보세요!</p>
          </div>
        ) : (
          posts.map((post) => (
            <Card key={post.id} className="bg-zinc-900 border-zinc-800 text-zinc-50 overflow-hidden shadow-xl rounded-2xl">
              <CardHeader className="p-4 flex flex-row items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm uppercase">
                  {post.author.charAt(0)}
                </div>
                <div className="flex flex-col flex-1">
                  <span className="font-semibold text-sm">{post.author}</span>
                  <span className="text-xs text-zinc-400">
                    {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : "방금 전"}
                  </span>
                </div>
                {user && (
                  <button onClick={() => handleDelete(post.id, post.imageUrl)} className="text-zinc-500 hover:text-red-400 transition-colors ml-auto p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </CardHeader>
              <div className="w-full aspect-square relative bg-zinc-800">
                <img
                  src={post.imageUrl}
                  alt="Feed photo"
                  className="w-full h-full object-cover"
                />
              </div>
              <CardContent className="p-4">
                <div className="flex gap-4 mb-4">
                  <button className="hover:text-red-500 transition-colors">
                    <Heart className="w-6 h-6" />
                  </button>
                  <button className="hover:text-zinc-300 transition-colors">
                    <MessageCircle className="w-6 h-6" />
                  </button>
                  <button className="hover:text-zinc-300 transition-colors">
                    <Share2 className="w-6 h-6" />
                  </button>
                </div>
                {post.comment && (
                  <p className="text-sm leading-relaxed tracking-wide text-zinc-200 whitespace-pre-wrap">
                    <span className="font-semibold mr-2">{post.author}</span>
                    {post.comment}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>

      {/* Floating Action Button for Upload */}
      {user && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-transform hover:scale-105 active:scale-95">
            <Plus className="h-6 w-6 font-bold" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-md w-[90vw] mx-auto rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-50 shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">새 추억 남기기</DialogTitle>
            <DialogDescription className="text-zinc-400">
              루미의 소중한 순간을 가족들과 공유하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-6 py-4">
            <div className="flex flex-col gap-2">
              <Label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">사진 선택</Label>
              <label className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800 hover:bg-zinc-700/50 transition-colors relative overflow-hidden">
                {file ? (
                  <img src={URL.createObjectURL(file)} alt="preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                ) : (
                  <div className="flex flex-col items-center justify-center pb-6 pt-5">
                    <Upload className="mb-3 h-8 w-8 text-zinc-400" />
                    <p className="mb-1 text-sm text-zinc-300 font-medium">클릭하여 사진 업로드</p>
                    <p className="text-xs text-zinc-500 mt-1">PNG, JPG (최대 10MB)</p>
                  </div>
                )}
                <Input 
                  id="dropzone-file" 
                  type="file" 
                  accept="image/*"
                  className="hidden" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="comment" className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">코멘트</Label>
              <Textarea
                id="comment"
                placeholder="오늘 루미는 어땠나요?"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 resize-none h-24 focus-visible:ring-zinc-600"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={uploading || !file}
              className="w-full bg-white text-black hover:bg-zinc-200 font-bold tracking-wide py-6 rounded-xl"
              onClick={handleUpload}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 저장 중...
                </>
              ) : "업로드하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

    </div>
  );
}

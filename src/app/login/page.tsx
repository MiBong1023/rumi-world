"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("test1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials") {
        try {
          // If the user doesn't exist, we auto-create them for this MVP scenario
          await createUserWithEmailAndPassword(auth, email, password);
          router.push("/");
        } catch (createErr: any) {
          console.error("Account creation failed:", createErr);
          setError(createErr.message);
          alert("로그인/계정 생성 실패: " + createErr.message);
        }
      } else {
        setError(err.message);
        alert("로그인 에러: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl overflow-hidden p-6">
        <div className="flex flex-col items-center mb-8 text-center pt-4">
          <h1 className="text-2xl font-bold tracking-widest text-zinc-100 mb-2">RUMI WORLD</h1>
          <p className="text-zinc-400 text-sm">소중한 우리 아기, 루미의 성장 일기</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-zinc-600"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-zinc-600"
              required
            />
          </div>
          <Button 
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black hover:bg-zinc-200 font-bold tracking-wide py-6 rounded-xl mt-4 transition-colors"
          >
            {loading ? "기록 불러오는 중..." : "Rumi 연대기 입장"}
          </Button>
        </form>
      </div>
    </div>
  );
}

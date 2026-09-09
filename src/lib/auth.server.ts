import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { getCookie } from "@tanstack/react-start/server";
import { query } from "./postgres";

const scrypt = promisify(scryptCallback);
export const AUTH_COOKIE_NAME = "dre_session";
const ttlHours = Number(process.env["AUTH_SESSION_TTL_HOURS"] ?? 72);
export async function hashPassword(password:string){if(password.length<8)throw new Error("A senha precisa ter pelo menos 8 caracteres.");const salt=randomBytes(16);const key=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024} as never) as Buffer;return `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;}
export async function verifyPassword(password:string,encoded:string|null){if(!encoded)return false;const [,N,r,p,salt,key]=encoded.split("$");if(!salt||!key)return false;const candidate=await scrypt(password,Buffer.from(salt,"base64url"),Buffer.from(key,"base64url").length,{N:Number(N),r:Number(r),p:Number(p),maxmem:64*1024*1024} as never) as Buffer;return timingSafeEqual(candidate,Buffer.from(key,"base64url"));}
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function createSession(userId:string){const token=randomBytes(32).toString("base64url"),expires=new Date(Date.now()+ttlHours*3600_000);await query("insert into auth_sessions (user_id,token_hash,expires_at) values ($1,$2,$3)",[userId,tokenHash(token),expires]);return{token,expires};}
export function sessionCookieOptions(expires?: Date) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    ...(expires ? { expires } : {}),
  };
}
export async function currentUser(){const token=getCookie(AUTH_COOKIE_NAME);if(!token)return null;const r=await query<{id:string;email:string;nome:string;ativo:boolean}>("select u.id,u.email,u.nome,u.ativo from auth_sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.ativo=true",[tokenHash(token)]);return r.rows[0]??null;}
export async function revokeCurrentSession(){const token=getCookie(AUTH_COOKIE_NAME);if(token)await query("update auth_sessions set revoked_at=now() where token_hash=$1 and revoked_at is null",[tokenHash(token)]);}
export async function revokeUserSessions(userId:string){await query("update auth_sessions set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);}

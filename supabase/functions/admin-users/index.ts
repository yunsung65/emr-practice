import { createClient } from "npm:@supabase/supabase-js@2";

const origin = "https://yunsung65.github.io";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "지원하지 않는 요청입니다." });
  if (request.headers.get("Origin") && request.headers.get("Origin") !== origin) {
    return reply(403, { error: "허용되지 않은 사이트입니다." });
  }
  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, { error: "로그인이 필요합니다." });

  try {
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return reply(401, { error: "다시 로그인해 주세요." });
    const { data: profile, error: profileError } = await client
      .from("profiles").select("role").eq("id", user.id).single();
    if (profileError || profile?.role !== "nurse") {
      return reply(403, { error: "관리자만 사용자를 관리할 수 있습니다." });
    }

    let body;
    try { body = await request.json(); }
    catch { return reply(400, { error: "올바른 사용자 정보를 입력하세요." }); }
    if (!body || !["create", "update", "delete"].includes(body.action)) {
      return reply(400, { error: "지원하지 않는 작업입니다." });
    }
    if (body.action !== "create") {
      if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
        return reply(400, { error: "사용자를 선택하세요." });
      }
      if (body.id === user.id) {
        return reply(400, { error: "본인 계정은 이 화면에서 변경하거나 삭제할 수 없습니다." });
      }
    }
    if (body.action === "delete") {
      const { error } = await client.auth.admin.deleteUser(body.id);
      if (error) return reply(400, { error: error.message });
      return reply(200, { success: true });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply(400, { error: "이름과 올바른 이메일을 입력하세요." });
    }
    if (!["student", "nurse"].includes(body.role)) {
      return reply(400, { error: "학생 또는 간호사 역할을 선택하세요." });
    }
    if (body.action === "create") {
      if (typeof body.password !== "string" || body.password.length < 6 || body.password.length > 256) {
        return reply(400, { error: "초기 비밀번호는 6자 이상으로 입력하세요." });
      }
      const { data, error } = await client.auth.admin.createUser({
        email, password: body.password, email_confirm: true,
        user_metadata: { full_name: name }, app_metadata: { emr_role: body.role },
      });
      if (error) return reply(400, { error: error.message });
      return reply(201, { id: data.user.id });
    }

    const { data: existing, error: lookupError } = await client.auth.admin.getUserById(body.id);
    if (lookupError || !existing.user) return reply(404, { error: "사용자를 찾을 수 없습니다." });
    const { error } = await client.auth.admin.updateUserById(body.id, {
      email,
      user_metadata: { ...existing.user.user_metadata, full_name: name },
      app_metadata: { ...existing.user.app_metadata, emr_role: body.role },
    });
    if (error) return reply(400, { error: error.message });
    return reply(200, { success: true });
  } catch {
    return reply(500, { error: "사용자 정보를 처리하지 못했습니다. 잠시 후 다시 시도하세요." });
  }
});

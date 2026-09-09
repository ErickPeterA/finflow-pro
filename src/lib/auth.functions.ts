import { createServerFn } from "@tanstack/react-start";

type LoginInput = { email: string; password: string };

export const loginLocal = createServerFn({ method: "POST" })
  .validator((data: LoginInput) => {
    const email = data.email.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
    if (data.password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    return { email, password: data.password };
  })
  .handler(async ({ data }) => {
    const [{ deleteCookie, setCookie }, auth, { query }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("./auth.server"),
      import("./postgres"),
    ]);
    const result = await query<{
      id: string;
      email: string;
      nome: string;
      ativo: boolean;
      password_hash: string | null;
    }>(
      "select id, email, nome, ativo, password_hash from users where lower(email) = $1 limit 1",
      [data.email],
    );
    const user = result.rows[0];
    if (!user || !user.ativo || !(await auth.verifyPassword(data.password, user.password_hash))) {
      throw new Error("E-mail ou senha inválidos.");
    }

    const session = await auth.createSession(user.id);
    setCookie(auth.AUTH_COOKIE_NAME, session.token, auth.sessionCookieOptions(session.expires));
    return { user: { id: user.id, email: user.email, nome: user.nome, ativo: user.ativo } };
  });

export const getLocalSession = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("./auth.server");
  return { user: await currentUser() };
});

export const logoutLocal = createServerFn({ method: "POST" }).handler(async () => {
  const [{ deleteCookie }, auth] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("./auth.server"),
  ]);
  await auth.revokeCurrentSession();
  deleteCookie(auth.AUTH_COOKIE_NAME, auth.sessionCookieOptions());
  return { ok: true };
});

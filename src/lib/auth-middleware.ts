import { createMiddleware } from "@tanstack/react-start";

export const requireAuthenticatedUser = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { currentUser } = await import("./auth.server");
    const user = await currentUser();
    if (!user) throw new Error("Unauthorized");
    return next({ context: { userId: user.id, user } });
  },
);

import api from "./axios";

export type UserDTO = {
  id: string;
  email: string;
  createdAt: string;
};

type UserResponse = { user: UserDTO };

export function register(email: string, password: string): Promise<UserDTO> {
  return api.post<UserResponse>("/auth/register", { email, password }).then((r) => r.data.user);
}

export function login(email: string, password: string): Promise<UserDTO> {
  return api.post<UserResponse>("/auth/login", { email, password }).then((r) => r.data.user);
}

export function logout(): Promise<void> {
  return api.post("/auth/logout").then(() => {});
}

export function me(): Promise<UserDTO> {
  return api.get<UserResponse>("/auth/me").then((r) => r.data.user);
}
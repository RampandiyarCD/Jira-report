import axios, { Axios } from "axios";


export const api: Axios = axios.create({
    baseURL: import.meta.env.VITE_CLIENT_URL,
    withCredentials: true,
});

export const handleLogin = async (email: string, url: string, token: string) => {
    return await api.post("/login", { email, url, token });
};
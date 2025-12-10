import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        verifySession();
    }, [token]);

    const verifySession = async () => {
        if (!token) {
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('/admin/verify', {
                headers: { 'X-Admin-Token': token }
            });

            if (response.ok) {
                setIsAuthenticated(true);
            } else {
                logout();
            }
        } catch (error) {
            console.error('Session verification failed:', error);
            setIsAuthenticated(false); // Don't logout immediately on network error, but for now safe
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (password) => {
        try {
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            // 先获取响应文本，再尝试解析 JSON
            const text = await response.text();
            if (!text) {
                return { success: false, error: '服务器无响应，请检查后端是否运行' };
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('JSON 解析失败:', text);
                return { success: false, error: '服务器响应格式错误' };
            }

            if (response.ok && data.success) {
                setToken(data.token);
                localStorage.setItem('adminToken', data.token);
                setIsAuthenticated(true);
                return { success: true };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        try {
            await fetch('/admin/logout', {
                method: 'POST',
                headers: { 'X-Admin-Token': token }
            });
        } catch (e) {
            // Ignore logout errors
        }
        setToken('');
        localStorage.removeItem('adminToken');
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ token, isAuthenticated, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

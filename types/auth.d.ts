// File: auth.d.ts

declare module '#auth-utils' {
    interface User {
        id: string;
        userId: string;
        email: string;
        name: string;
        accessToken: string;
    }

    interface UserSession {
        user: User;
        loggedInAt: Date;
    }

    interface SecureSessionData {
        accessToken: string;
    }
}

export { }

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

// Redirect /login to /auth/signin (the proper NextAuth flow)
// The old /login page bypassed NextAuth and created inconsistent sessions
export default function LoginPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    useEffect(() => {
        if (status === 'authenticated') {
            router.replace('/');
        } else if (status === 'unauthenticated') {
            router.replace('/auth/signin');
        }
    }, [status, router]);

    return null;
}

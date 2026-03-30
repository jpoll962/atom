import React, { useState, useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import type { AppProps } from "next/app";

import { ToastProvider } from "../components/ui/use-toast";
import { GlobalChatWidget } from "../components/GlobalChatWidget";
import "../styles/globals.css";

import Layout from "../components/layout/Layout";
import { useRouter } from "next/router";
import { WakeWordProvider } from "../contexts/WakeWordContext";
import { useCliHandler } from "../hooks/useCliHandler";

const TauriHooks = () => {
  useCliHandler();
  return null;
};

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/chat": "Chat",
  "/search": "Search",
  "/documents": "Documents",
  "/tasks": "Tasks",
  "/automations": "Automations",
  "/agents": "Agents",
  "/marketplace": "Marketplace",
  "/dashboards/projects": "Projects",
  "/dashboards/sales": "Sales & CRM",
  "/dashboards/support": "Support",
  "/dashboards/knowledge": "Knowledge",
  "/communication": "Communication",
  "/sales": "Sales",
  "/marketing": "Marketing",
  "/finance": "Finance",
  "/analytics": "Analytics",
  "/calendar": "Calendar",
  "/health": "Health",
  "/voice": "Voice",
  "/admin/jit-verification": "JIT Verification",
  "/admin/business-facts": "Business Facts",
  "/integrations": "Integrations",
  "/dev-studio": "Dev Studio",
  "/settings": "Settings",
  "/auth/signin": "Sign In",
  "/auth/signup": "Sign Up",
  "/login": "Sign In",
};

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);


  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const title = ROUTE_TITLES[router.pathname];
    document.title = title ? `Atom | ${title}` : "Atom";
  }, [router.pathname]);

  // Default to false during SSR/prerender to avoid router errors
  const isStandalonePage = mounted ? (router.pathname.startsWith("/auth")) : false;


  return (
    <SessionProvider session={session}>
      <TauriHooks />
      <ChakraProvider value={defaultSystem}>
        <ToastProvider>
          <WakeWordProvider>
            {isStandalonePage ? (
              <Component {...pageProps} />
            ) : (
              <Layout>
                <Component {...pageProps} />
              </Layout>
            )}
            {mounted && !isStandalonePage && <GlobalChatWidget />}
          </WakeWordProvider>
        </ToastProvider>
      </ChakraProvider>
    </SessionProvider>
  );
}

export default MyApp;


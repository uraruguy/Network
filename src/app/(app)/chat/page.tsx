import { Suspense } from "react";
import { ChatView } from "@/components/chat/ChatView";

export const metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}

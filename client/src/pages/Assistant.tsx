import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Sparkles } from "lucide-react";

/**
 * Assistant — ask anything about your GPs, coaching and what needs
 * attention. Thin client over assistant.ask: it keeps the visible chat
 * history and forwards the recent turns so follow-ups have context. The
 * server grounds every answer on a read-only snapshot of the caller's own
 * data, so the assistant can't see (or change) anything outside their scope.
 */
export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.answer }]),
    onError: (e) => toast.error(e.message || "The assistant is unavailable right now."),
  });

  const handleSend = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    // History = the turns the user already sees (excluding the new one),
    // last 12, user/assistant only.
    const history = messages
      .filter((m) => m.role !== "system")
      .slice(-12)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    ask.mutate({ question: trimmed, history });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Assistant"
        subtitle="Ask anything about your GPs, scores, coaching and what needs attention — answered from your live studio data."
        icon={Sparkles}
      />
      <AIChatBox
        messages={messages}
        onSendMessage={handleSend}
        isLoading={ask.isPending}
        placeholder="Ask: who hasn't been evaluated? how is Team B doing? what should I do first?"
        emptyStateMessage="I answer from your current data — coverage gaps, score regressions, coaching tasks and what needs attention right now."
        suggestedPrompts={[
          "What should I focus on today?",
          "Who hasn't been evaluated this month?",
          "Which GPs regressed recently?",
          "Summarise my open coaching tasks",
        ]}
        height="calc(100vh - 230px)"
      />
    </div>
  );
}

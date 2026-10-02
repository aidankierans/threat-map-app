import { serviceRequest, hosting } from "./hosting.js";
import { useState } from "preact/hooks";
import { FEEDBACK_LIMITS } from "./config.js";
type Phase = {
    kind: "editing";
} | {
    kind: "sending";
} | {
    kind: "sent";
} | {
    kind: "failed";
    message: string;
};
function failureFor(status: number): string {
    if (status === 429) {
        return "Nothing was sent — that was a lot of submissions at once. Wait a minute and press send again.";
    }
    if (status === 413) {
        return "Nothing was sent — the message is too long. Shorten it and try again.";
    }
    if (status === 400) {
        return "Nothing was sent — the message came through empty.";
    }
    return "Nothing was sent — the form is not working right now. Your message is still here; try again in a little while.";
}
export function FeedbackForm() {
    const [message, setMessage] = useState("");
    const [name, setName] = useState("");
    const [contact, setContact] = useState("");
    const [phase, setPhase] = useState<Phase>({ kind: "editing" });
    const over = message.length > FEEDBACK_LIMITS.message;
    const nearLimit = message.length > FEEDBACK_LIMITS.message * 0.8;
    const sending = phase.kind === "sending";
    async function send(event: Event) {
        event.preventDefault();
        if (!message.trim() || over || sending)
            return;
        setPhase({ kind: "sending" });
        try {
            const response = await serviceRequest("feedback", { body: { message, name, contact } });
            if (response.ok) {
                setPhase({ kind: "sent" });
                setMessage("");
                setName("");
                setContact("");
                return;
            }
            setPhase({ kind: "failed", message: failureFor(response.status) });
        }
        catch {
            setPhase({
                kind: "failed",
                message: "Nothing was sent — the message did not reach the server. Try again.",
            });
        }
    }
    if (phase.kind === "sent") {
        return (<div class="feedback">
        <p class="feedbacksent" role="status">
          Sent. Thank you.
        </p>
        <button class="btn" onClick={() => setPhase({ kind: "editing" })}>
          Send something else
        </button>
      </div>);
    }
    return (<form class="feedback" method="POST" action={hosting().feedbackAction} onSubmit={send}>
      <label class="feedbackfield">
        <span>Your message</span>
        <textarea name="message" rows={8} required value={message} onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)} placeholder="What is wrong, missing, or unclear?"/>
      </label>

      <div class="feedbackrow">
        <label class="feedbackfield">
          <span>
            Name <em>optional</em>
          </span>
          <input type="text" name="name" value={name} maxLength={FEEDBACK_LIMITS.name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Leave blank to stay anonymous"/>
        </label>
        <label class="feedbackfield">
          <span>
            Reply address <em>optional</em>
          </span>
          <input type="text" name="contact" value={contact} maxLength={FEEDBACK_LIMITS.contact} onInput={(e) => setContact((e.target as HTMLInputElement).value)} placeholder="Only if you want an answer"/>
        </label>
      </div>

      <div class="feedbackfoot">
        <button class="btn" type="submit" disabled={!message.trim() || over || sending}>
          {sending ? "Sending…" : "Send"}
        </button>
        {nearLimit && (<span class={`feedbackcount ${over ? "bad" : ""}`}>
            {message.length} / {FEEDBACK_LIMITS.message}
          </span>)}
      </div>

      {phase.kind === "failed" && (<p class="feedbackerror" role="alert">
          {phase.message}
        </p>)}
    </form>);
}

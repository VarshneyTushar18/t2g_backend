import {
  notifyConversationEnded,
  processPendingConversations,
} from "./elevenlabs.fallback.service.js";

export const notifyEnded = async (req, res) => {
  try {
    const conversationId =
      req.body?.conversationId ?? req.body?.conversation_id ?? null;
    const agentId =
      req.body?.agentId ??
      req.body?.agent_id ??
      process.env.ELEVENLABS_AGENT_ID ??
      null;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    console.log(
      `[elevenlabs-fallback] notify-ended: ${conversationId} (agent: ${agentId || "default"})`,
    );

    const result = await notifyConversationEnded({ conversationId, agentId });

    // Fetch transcript + send email in background (can take up to ~2 min while ElevenLabs finalizes).
    void processPendingConversations().catch((err) => {
      console.error("[elevenlabs-fallback] background process error:", err.message);
    });

    return res.status(200).json({
      success: true,
      processing: true,
      ...result,
    });
  } catch (err) {
    console.error("[elevenlabs-fallback] notify-ended error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const processPending = async (req, res) => {
  try {
    console.log("[elevenlabs-fallback] process-pending started");
    const result = await processPendingConversations();

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[elevenlabs-fallback] process-pending error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

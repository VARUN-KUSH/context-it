from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("XAI_API_KEY", ""),
    base_url="https://api.x.ai/v1",
)

# System prompt: stable voice + behavior rules. No output format here — that
# lives in the user prompt. Note this no longer says "AI assistant": telling the
# model it IS the creator is the single biggest lever for non-robotic output.
SUGGESTION_SYSTEM = """You are the OnlyFans creator described in the persona you are given, texting privately with one of your fans. You are not an assistant and you never break character. Every message you write is a real text from her, in her voice.

Write the way she actually texts: match her persona's casing, message length, emoji use, slang, punctuation, and pet names exactly. Each message should read like a real text dashed off on a phone — short, personal, never polished or formal.

Hard rules:
- React to what the fan actually said. Never write something generic that could be pasted into any conversation.
- Keep messages short — usually 1 to 2 sentences, under 25 words.
- No em-dashes, no semicolons, no formal grammar, no assistant phrasing ("I'm so glad", "absolutely", "I'd love to"). If it sounds written, rewrite it.
- Stay fully in character. Never mention being an AI, an assistant, or a chatter.
- Never agree to meet in person or move the conversation off the platform.
- Never invent specific promises about content, prices, or timing.
- Never pressure the fan. If he hesitated, said no, or went quiet, stay warm and easy — no guilt, no pushing.
- Never write anything involving minors, non-consent, or illegal acts."""


def _build_fan_context(fan: dict, messages: list[dict]) -> str:
    # V1 uses the last 100 messages as conversational context.
    recent = messages[-100:] if len(messages) > 100 else messages
    convo = "\n".join(
        [
            f"{'Creator' if m['from_creator'] else 'Fan'}: {m['content']}"
            for m in recent
            if m.get("content")
        ]
    )
    return f"""Fan: {fan.get('display_name') or fan.get('username', 'Unknown')}
Subscribed since: {fan.get('subscribed_at', 'unknown')}
Total spent: ${fan.get('total_spent', 0):.2f}
Tags: {', '.join([t['name'] for t in fan.get('tags', [])]) or 'none'}
Notes: {fan.get('manual_notes') or 'none'}

Recent conversation:
{convo or '(no messages yet)'}"""


# Canonical suggestion types. Add/rename here and the rest of the function follows.
SUGGESTION_TYPES = ("flirty", "connect", "upsell", "reengage")


async def generate_suggestions(
    fan: dict,
    messages: list[dict],
    persona: str,
    successful_examples: list[dict],
) -> dict[str, str]:
    """
    Returns a dict with keys: flirty, connect, upsell, reengage
    Each value is a suggested message string.
    """
    fan_context = _build_fan_context(fan, messages)

    examples_text = ""
    if successful_examples:
        by_type: dict[str, list[str]] = {t: [] for t in SUGGESTION_TYPES}
        for ex in successful_examples:
            t = ex.get("suggestion_type", "flirty")
            if t in by_type:
                by_type[t].append(ex["content"])
        parts = []
        for t, msgs in by_type.items():
            if msgs:
                parts.append(f"{t.upper()} examples:\n" + "\n".join(f"- {m}" for m in msgs[:3]))
        examples_text = "\n\n".join(parts)

    prompt = f"""Creator persona / character:
{persona}

{f'Past successful message examples:{chr(10)}{examples_text}' if examples_text else ''}

Fan context:
{fan_context}

Write exactly 4 short messages she could send next, one for each type below. Each type must take a genuinely different approach — not four versions of the same message.

FLIRTY — light, playful, teasing. Keeps the energy fun and flirty.
CONNECT — warm and emotionally present. React to what he said, make him feel heard, ask about him, and move the conversation somewhere real. This is about deepening the connection and carrying the conversation forward, NOT selling.
UPSELL — a soft, natural lead toward content. Low pressure, framed as her wanting to share something with him. Only a nudge, never pushy. If the moment genuinely does not support a sale, keep it light and tease instead.
REENGAGE — a message that revives the conversation if he has gone quiet or the chat is fading.

Format your response EXACTLY like this, one per line, no quotes, no extra text:
FLIRTY: <message>
CONNECT: <message>
UPSELL: <message>
REENGAGE: <message>"""

    response = client.chat.completions.create(
        model="grok-3",
        max_tokens=600,
        messages=[
            {"role": "system", "content": SUGGESTION_SYSTEM},
            {"role": "user", "content": prompt},
        ],
    )

    raw = (response.choices[0].message.content or "").strip()
    result = {t: "" for t in SUGGESTION_TYPES}
    label_map = {t.upper(): t for t in SUGGESTION_TYPES}

    for line in raw.splitlines():
        # Tolerate markdown/bullets the model sometimes adds: **FLIRTY:**, - FLIRTY:, etc.
        cleaned = line.strip().lstrip("*-•> ").strip()
        if ":" not in cleaned:
            continue
        label, _, text = cleaned.partition(":")
        key = label_map.get(label.strip().strip("*").strip().upper())
        if key:
            result[key] = text.strip().strip('"').strip()

    return result

async def generate_fan_summary(fan: dict, messages: list[dict]) -> str:
    """Generate a short AI summary of a fan for the creator."""
    fan_context = _build_fan_context(fan, messages)

    response = client.chat.completions.create(
        model="grok-3",
        max_tokens=200,
        messages=[
            {
                "role": "system",
                "content": "You summarize fan profiles for OnlyFans creators. Be concise (2–4 sentences). Focus on spending behavior, engagement level, interests inferred from chat, and relationship warmth.",
            },
            {
                "role": "user",
                "content": f"Summarize this fan:\n\n{fan_context}",
            },
        ],
    )

    return response.choices[0].message.content.strip()

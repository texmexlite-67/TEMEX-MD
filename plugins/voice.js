import {
  VOICE_PRESETS,
  generateSpeechAudio,
  sendReadyVoiceToChat
} from '../lib/tts.js';
import {
  generateBibleContent,
  generatePrayerContent,
  generateMotivationContent,
  generateQuoteContent,
  generatePsychologyContent,
  generateSpiritualContent,
  pushContentToStatus
} from '../lib/status-poster.js';
import { askTexmexAi } from '../lib/ai.js';
import { updateSettings } from '../lib/store.js';
import { sciFiCard } from '../lib/style.js';

export default [
  {
    name: 'tts',
    aliases: ['voice', 'speak', 'say', 'vn', 'voicenote'],
    category: 'voice',
    desc: 'Convert any text or replied message (e.g. Bible verse, prayer, quote) into AI Neural speech ready for listening',
    usage: '.tts <text> (or reply .tts to any message)',
    react: '🎙️',
    async execute({ sock, m, text, settings }) {
      const target = text || m.quoted?.text;
      if (!target) {
        return m.reply(
          sciFiCard('AI VOICE GENERATOR', [
            `🎙️ *Usage:*`,
            `▸ *.tts <any text>* — Generate AI speech`,
            `▸ *Reply .tts* to any Bible verse, prayer, or message`,
            `▸ *.bibleaudio [John 3:16]* — Bible verse + AI Voice`,
            `▸ *.prayeraudio [exam/family]* — Prayer + AI Voice`,
            `▸ *.pushvoice bible* — Push AI Voice straight to Status`
          ])
        );
      }

      const voice = settings.ttsVoice || 'andrew';
      await sendReadyVoiceToChat(sock, m.chat, target, {
        quoted: m.raw,
        voice,
        title: 'TEXMEX_AI_VOICE'
      });
    }
  },
  {
    name: 'bibleaudio',
    aliases: ['vbible', 'voicebible', 'audiobible', 'speakbible'],
    category: 'voice',
    desc: 'Extract a Bible verse and generate ready-to-listen AI Neural TTS audio',
    usage: '.bibleaudio [John 3:16 | Psalm 23 | peace]',
    react: '🎧',
    async execute({ sock, m, text, settings }) {
      const content = await generateBibleContent(text || m.quoted?.text || '');
      await m.reply(sciFiCard('HOLY SCRIPTURE // AUDIO', [content]));
      await sendReadyVoiceToChat(sock, m.chat, content, {
        quoted: m.raw,
        voice: settings.ttsVoice || 'andrew',
        title: 'BIBLE_AUDIO'
      });
    }
  },
  {
    name: 'prayeraudio',
    aliases: ['vprayer', 'voiceprayer', 'audioprayer', 'speakprayer'],
    category: 'voice',
    desc: 'Generate a Bible-extracted prayer and push ready-to-listen AI Neural TTS audio',
    usage: '.prayeraudio [exam | travel | prosperity | family | friends | self | group | motivational | success | failure]',
    react: '🙏',
    async execute({ sock, m, text, settings }) {
      const content = await generatePrayerContent(text || m.quoted?.text || '');
      await m.reply(sciFiCard('PRAYER // AUDIO', [content]));
      await sendReadyVoiceToChat(sock, m.chat, content, {
        quoted: m.raw,
        voice: settings.ttsVoice || 'andrew',
        title: 'PRAYER_AUDIO'
      });
    }
  },
  {
    name: 'motivateaudio',
    aliases: ['vmotivate', 'voicemotivate', 'audiomotivate'],
    category: 'voice',
    desc: 'Generate daily Motivation + ready-to-listen AI Neural TTS audio',
    usage: '.motivateaudio [optional topic]',
    react: '🔥',
    async execute({ sock, m, text, settings }) {
      const content = await generateMotivationContent(text || m.quoted?.text || '');
      await m.reply(sciFiCard('MOTIVATION // AUDIO', [content]));
      await sendReadyVoiceToChat(sock, m.chat, content, {
        quoted: m.raw,
        voice: settings.ttsVoice || 'andrew',
        title: 'MOTIVATION_AUDIO'
      });
    }
  },
  {
    name: 'quoteaudio',
    aliases: ['vquote', 'voicequote', 'audioquote'],
    category: 'voice',
    desc: 'Generate an inspiring Quote + ready-to-listen AI Neural TTS audio',
    usage: '.quoteaudio [optional topic]',
    react: '💡',
    async execute({ sock, m, text, settings }) {
      const content = await generateQuoteContent(text || m.quoted?.text || '');
      await m.reply(sciFiCard('WISDOM QUOTE // AUDIO', [content]));
      await sendReadyVoiceToChat(sock, m.chat, content, {
        quoted: m.raw,
        voice: settings.ttsVoice || 'andrew',
        title: 'QUOTE_AUDIO'
      });
    }
  },
  {
    name: 'psychaudio',
    aliases: ['vpsych', 'voicepsych', 'audiopsych'],
    category: 'voice',
    desc: 'Generate a Psychology insight + ready-to-listen AI Neural TTS audio',
    usage: '.psychaudio [optional topic]',
    react: '🧠',
    async execute({ sock, m, text, settings }) {
      const content = await generatePsychologyContent(text || m.quoted?.text || '');
      await m.reply(sciFiCard('PSYCHOLOGY // AUDIO', [content]));
      await sendReadyVoiceToChat(sock, m.chat, content, {
        quoted: m.raw,
        voice: settings.ttsVoice || 'andrew',
        title: 'PSYCHOLOGY_AUDIO'
      });
    }
  },
  {
    name: 'voiceai',
    aliases: ['vai', 'aispeak', 'askvoice'],
    category: 'voice',
    desc: 'Ask TEXMEX-MD AI anything and receive both text + spoken AI Voice response',
    usage: '.voiceai <question>',
    react: '🤖',
    async execute({ sock, m, text, settings }) {
      const prompt = text || m.quoted?.text;
      if (!prompt) return m.reply('⚙️ Usage: *.voiceai Explain Psalm 23 in simple words*');
      const answer = await askTexmexAi(prompt, { userKey: m.sender, useMemory: true });
      await m.reply(sciFiCard('TEXMEX-MD // VOICE AI', [answer]));
      await sendReadyVoiceToChat(sock, m.chat, answer, {
        quoted: m.raw,
        voice: settings.ttsVoice || 'andrew',
        title: 'TEXMEX_AI_SPEECH'
      });
    }
  },
  {
    name: 'pushvoice',
    aliases: ['pushaudio', 'voicestatus', 'audiostatus', 'ttstostatus', 'pushvoicestatus'],
    category: 'status',
    desc: 'Synthesize AI Neural TTS from Bible/Prayer/Motivation/Quote/Text and push the spoken audio directly to WhatsApp Status + chat',
    usage: '.pushvoice <bible [ref] | prayer [type] | motivate | psych | quote | custom text>',
    ownerOnly: true,
    react: '📡',
    async execute({ sock, m, args, text, settings }) {
      const first = (args[0] || '').toLowerCase();
      const rest = args.slice(1).join(' ').trim();
      let script = '';

      if (['bible', 'verse', 'scripture'].includes(first)) {
        script = await generateBibleContent(rest);
      } else if (['prayer', 'pray'].includes(first)) {
        script = await generatePrayerContent(rest);
      } else if (['motivate', 'motivation'].includes(first)) {
        script = await generateMotivationContent(rest);
      } else if (['psych', 'psychology', 'pyschology'].includes(first)) {
        script = await generatePsychologyContent(rest);
      } else if (['quote', 'quotes'].includes(first)) {
        script = await generateQuoteContent(rest);
      } else if (['spiritual', 'devo'].includes(first)) {
        script = await generateSpiritualContent(rest);
      } else {
        script = text || m.quoted?.text || '';
      }

      if (!script) {
        return m.reply(
          sciFiCard('PUSH AI VOICE TO STATUS', [
            `🎙️ *Usage:*`,
            `▸ *.pushvoice bible [John 3:16]*`,
            `▸ *.pushvoice prayer [exam / family / travel]*`,
            `▸ *.pushvoice motivate [discipline]*`,
            `▸ *.pushvoice quote*`,
            `▸ *.pushvoice <your custom text>*`,
            `▸ Or reply *.pushvoice* to any message!`
          ])
        );
      }

      const voice = settings.ttsVoice || 'andrew';
      const ttsRes = await generateSpeechAudio(script, { voice, preferOpusPtt: true });

      const statusMime =
        ttsRes.mimetype === 'audio/mpeg' ? 'audio/mp4' : ttsRes.mimetype;

      const pushed = await pushContentToStatus(sock, {
        audio: ttsRes.buffer,
        mimetype: statusMime,
        ptt: true
      });

      await m.reply(
        sciFiCard('AI VOICE PUSHED TO STATUS', [
          `✅ Spoken AI Audio published to your WhatsApp Status!`,
          `🎙️ *Voice:* ${ttsRes.voiceLabel} (${ttsRes.engine})`,
          `👥 *Audience:* ${pushed.recipientsCount} contact(s)`,
          `📝 *Script:*`,
          script
        ])
      );

      // Also deliver the ready-to-listen audio file directly in the chat
      await sock.sendMessage(
        m.chat,
        {
          audio: ttsRes.buffer,
          mimetype: ttsRes.mimetype,
          ptt: ttsRes.ptt,
          fileName: 'TEXMEX_STATUS_VOICE.mp3'
        },
        { quoted: m.raw }
      );
    }
  },
  {
    name: 'setvoice',
    aliases: ['voices', 'ttsvoice', 'ttslist'],
    category: 'voice',
    desc: 'Choose your AI Neural TTS narrator voice (US, Kenyan, British, or Swahili)',
    usage: '.setvoice <andrew | aria | chilemba | asilia | ryan | swahili>',
    react: '🗣️',
    async execute({ m, args, settings }) {
      const choice = (args[0] || '').toLowerCase();
      if (!VOICE_PRESETS[choice]) {
        const lines = Object.values(VOICE_PRESETS).map(
          (v) =>
            `▸ *.setvoice ${v.id}* — ${v.label}${
              (settings.ttsVoice || 'andrew') === v.id ? ' ✅' : ''
            }`
        );
        return m.reply(sciFiCard('AI NEURAL VOICES', lines));
      }
      updateSettings({ ttsVoice: choice });
      await m.reply(
        sciFiCard('AI VOICE UPDATED', [
          `🎙️ Active narrator set to: *${VOICE_PRESETS[choice].label}*`
        ])
      );
    }
  },
  {
    name: 'autovoice',
    aliases: ['autotts', 'autospeak'],
    category: 'voice',
    desc: 'Toggle automatic AI TTS audio generation whenever Bible, Prayer, Motivation, Quote, or Psychology text is generated',
    usage: '.autovoice <on | off>',
    ownerOnly: true,
    react: '🔊',
    async execute({ m, args, settings }) {
      const opt = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(opt)) {
        return m.reply(
          sciFiCard('AUTO AI VOICE (TTS)', [
            `🔊 *Current:* ${settings.autoVoice !== false ? 'ON (Auto-generates audio ready for listening)' : 'OFF'}`,
            `🎙️ *Narrator:* ${VOICE_PRESETS[settings.ttsVoice || 'andrew']?.label}`,
            `▸ *.autovoice on* — Auto-push spoken audio with Bible/Prayer/Mind cards`,
            `▸ *.autovoice off* — Text only (use .tts or .bibleaudio on demand)`
          ])
        );
      }
      const enabled = opt === 'on';
      updateSettings({ autoVoice: enabled });
      await m.reply(
        sciFiCard('AUTO AI VOICE UPDATED', [
          `🔊 Automatic AI Voice generation is now *${enabled ? 'ENABLED' : 'DISABLED'}*!`
        ])
      );
    }
  }
];

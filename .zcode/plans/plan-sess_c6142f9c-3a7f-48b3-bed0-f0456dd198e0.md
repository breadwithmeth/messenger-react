## Plan: Make Ultra Mode Maximally Compact

### Current State (ChatsPage.tsx:254-258, ChatsPage.module.css:4988-5077)
- Chat item height: 58px
- Avatar: 26px
- Font sizes: 9-11px
- Padding/gaps: 4-6px

### Proposed Changes

**1. ChatsPage.tsx - Reduce estimated height (line 257)**
- Change `ultra: 58` → `ultra: 46`

**2. ChatsPage.module.css - Make .density-ultra even more compact:**

| Element | Current | Proposed |
|---------|---------|----------|
| `.chatItem` padding | 5px 6px | 3px 4px |
| `.chatItem` gap | 6px | 3px |
| `.chatItem` margin-bottom | 4px | 2px |
| `.chatItem` border-radius | 8px | 4px |
| `.avatarImage/Placeholder` | 26px | 20px |
| `.avatarPlaceholder` font-size | 10px | 8px |
| `.chatName` font-size | 11px | 10px |
| `.chatLastMessage` font-size | 10px | 9px |
| Small badges (time, subtitle, etc.) | 9px | 8px |
| `.chatSelectButton` | 14px | 12px |
| Search/input heights | 24px | 20px |
| Search/input font-size | 10px | 9px |
| Buttons (menuToggle, etc.) | 24×24px | 20×20px |
| Selects height | 22px | 20px |
| Selects font-size | 9px | 8px |
| Filter/bulk buttons min-height | 21px | 18px |
| messageInputContainer padding | 8px 10px | 6px 8px |
| messageInputContainer gap | 6px | 4px |

**3. Also add ultra-compact styles for chat window (right panel):**
- `.density-ultra .messagesList` - reduce padding, gap
- `.density-ultra .messageContent` - reduce padding, border-radius
- `.density-ultra .messageText` - reduce font-size
- `.density-ultra .messageInputContainer` (chat window) - reduce padding
- `.density-ultra .attachButton`, `.voiceButton`, `.sendButton` - reduce size

This will make ultra mode the absolute maximum density while maintaining readability.
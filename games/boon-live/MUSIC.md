# แสงเช้าในลานบุญ

ดนตรีบรรเลงสำหรับเกมลานบุญ LIVE สร้างเสียงจาก Web Audio oscillator โดยตรง ไม่ใช้ไฟล์บันทึกเสียง sample เพลงเชิงพาณิชย์ หรือเพลงอ้างอิงภายนอก ไม่มีเสียงร้อง

ลักษณะเสียง: คีย์เสียงใสนุ่มและคอร์ดประสานเบา ๆ ความเร็ว 64 BPM ลำดับโน้ต 32 จังหวะ วนต่อเนื่อง มี delay เบา ๆ เพื่อให้เหมาะเป็นเพลงคลอ

การใช้งาน: กดเปิดเพลงในหน้าเกม ปรับความดังได้ และลดเหลือ 20% ของระดับที่ตั้งไว้ระหว่างมีเสียงอวยพร ปิดการลดเสียงอัตโนมัติได้ ใช้แหล่งเสียงจากหน้าเดียวเพื่อหลีกเลี่ยงเสียงซ้ำ

โน้ต melody MIDI: 72, rest, 76, 79, 81, rest, 79, 76, 74, rest, 76, 79, 76, rest, 74, 72, 69, rest, 72, 76, 79, rest, 76, 72, 67, rest, 69, 72, 74, rest, 72, 67

คอร์ด MIDI: [48,55,59,64], [45,52,55,60], [41,48,52,57], [43,50,55,60]

โค้ดเสียงอยู่ใน game.js ระหว่าง ORIGINAL MUSIC ENGINE START / END ไม่ต้องดาวน์โหลดเพลงหรือเชื่อมบริการเพลง

## Version 29 — gift invitations
Native browser TTS can rotate welcoming/follow prompts and optional gift invitations. Choose mixed, cheer or welcome in the host panel. Known gift names and actions come from current gift bindings, so remapping updates spoken invitations. Preview is available without starting the loop. Actual gift thanks interrupt all invitation speech. Prompts describe simulated game activity and do not promise rewards, health improvements or real temple donations in exchange for gifts.

## Version 30 — conversational ceremony host
Rewrote welcomes, gift invitations and donor thanks in a spoken Thai ceremony-host style: ญาติโยม, เชิญทางนี้, ตามสะดวก, อนุโมทนา. Eight gift invitation variants use current bindings; occasional lines identify the online simulated activity and avoid suggesting real temple donation. Browser TTS still supplies the voice; this changes wording and phrasing, not a human voice recording.

## Version 31 — natural host speech
Removed references to game mechanics, avatars, scores and simulation from spoken invitations. Invitations still accurately describe TikTok gifts and participation, without claiming money is donated to a temple. The on-screen simulated-activity/non-donation notice remains in place.

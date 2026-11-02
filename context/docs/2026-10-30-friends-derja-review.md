# Derja wording review: friends UI

Scope: all `friends.*` keys plus `lobby.tileWithBadge` and `lobby.friendRequests_one/_other` in `apps/mobile/src/i18n/locales/aeb.ts`.
71 keys reviewed, 6 changed. Every placeholder is unchanged.

Terms used across the feature: friend/friends = صاحب / صحاب (article الصحاب). Request = طلب (friend request = طلب صحبة). Block = بلوكي, unblock = نحّي البلوك. Remove = نحّي. Cancel = بطّل. Code = الكود. Share = شارك. Copy = انسخ. Player = لاعب. Online/offline = متّصل / موش متّصل. Add = زيد / زيدو.

| key | English | Derja (final) | note |
|---|---|---|---|
| `lobby.tileWithBadge` | {{title}}, {{badge}} | {{title}}، {{badge}} | Kept |
| `lobby.friendRequests_one` | {{count}} friend request | {{count}} طلب صحبة | Kept. Same form as `_other`: aeb has no Intl plural rules, so `_other` also covers 2–10. Singular after the number is how the catalog already does it (`{{count}} ورقة`, `{{count}} نقطة`). |
| `lobby.friendRequests_other` | {{count}} friend requests | {{count}} طلب صحبة | Kept. "طلبات" would be right for 3–10 but wrong for 11+, so I left it singular. **Flag:** check that "5 طلب صحبة" reads OK on the badge. |
| `friends.title` | Friends | الصحاب | Kept |
| `friends.myCode` | My code | الكود متاعي | Kept. "متاعي" matches the possessive style used in the catalog. |
| `friends.myCodeHint` | Give this code to a friend so they can add you. | عطي الكود هذا لصاحبك باش يزيدك في صحابو. | **Changed** from "…باش يزيدك." On its own "يزيدك" can read as "give you more". "يزيدك في صحابو" makes it clear: "adds you to his friends". |
| `friends.share` | Share | شارك | Kept. Same as `room.share`. |
| `friends.copy` | Copy code | انسخ الكود | Kept. Same as `room.copy`. |
| `friends.copied` | Code copied | الكود تنسخ | Kept. Same as `room.copied`. |
| `friends.copyUnavailable` | Select the code to copy it. | اختار الكود باش تنسخو. | Kept |
| `friends.shareMessage` | Add me as a friend on Chkobba! My code: {{code}} | زيدني في صحابك على الشكبّة! الكود متاعي: {{code}} | **Changed** from "زيدني صاحب في الشكبّة!". "زيدني في صحابك" (add me to your friends) is more natural. "على الشكبّة" avoids a doubled "في". |
| `friends.shareMessageLink` | Add me as a friend on Chkobba! My code: {{code}} {{link}} | زيدني في صحابك على الشكبّة! الكود متاعي: {{code}} {{link}} | **Changed** to match `shareMessage`. |
| `friends.add.label` | Add by code | زيد بالكود | Kept |
| `friends.add.placeholder` | XXXX-XXXX | XXXX-XXXX | Kept |
| `friends.add.submit` | Add friend | زيدو صاحب | Kept |
| `friends.add.invalid` | Codes are 8 letters and digits. | الكود لازمو 8 حروف وأرقام. | Kept. Mirrors `lobby.joinCode.invalid`. |
| `friends.add.looking` | Looking up the code… | قاعدين نلوّجو على الكود… | Kept |
| `friends.add.found` | Player found | لقينا اللاعب | Kept |
| `friends.add.self` | This is your code | هذا الكود متاعك | Kept |
| `friends.add.notFound` | No player with this code | ما فمّاش لاعب بالكود هذا | Kept |
| `friends.link.title` | Friend code | كود صاحب | Kept. **Flag:** "كود صاحب" (a friend's code) works as the `/f/CODE` screen title. "كود الصحبة" is an alternative. |
| `friends.link.openFriends` | Open friends | روح للصحاب | **Changed** from "حلّ الصحاب" ("open the friends" sounds like opening people). "روح للصحاب" means go to Friends. **Flag:** please confirm. |
| `friends.sections.incoming` | Requests | الطلبات | Kept |
| `friends.sections.outgoing` | Sent | اللي بعثتهم | Kept. **Flag:** "اللي بعثتهم" is short and fine under the Requests section. "الطلبات اللي بعثتهم" is clearer but long. |
| `friends.sections.friends` | Friends | الصحاب | Kept |
| `friends.sections.recent` | Recent players | اللي لعبت معاهم | **Changed** from "لعبت معاهم مؤخّراً". "مؤخّراً" is MSA. "اللي لعبت معاهم" matches the wording `confirm.blockBody` already uses. |
| `friends.sections.blocked` | Blocked | المبلوكين | Kept |
| `friends.actions.accept` | Accept | اقبل | Kept |
| `friends.actions.decline` | Decline | ارفض | Kept |
| `friends.actions.cancel` | Cancel request | بطّل الطلب | Kept |
| `friends.actions.add` | Add friend | زيدو صاحب | Kept. "زيدو صاحب" (add him as a friend) is used for every Add button (tests assert it). |
| `friends.actions.remove` | Remove | نحّي | Kept. "نحّي" is the one remove verb. The spoken label adds the name through `actionFor`. |
| `friends.actions.block` | Block | بلوكي | Kept. "بلوكي" is the one block verb everywhere (actions, sheet, confirm). |
| `friends.actions.unblock` | Unblock | نحّي البلوك | Kept |
| `friends.actions.requestSent` | Request sent | الطلب تبعث | Kept |
| `friends.actions.friends` | Friends | صحاب | Kept. A status badge ("you're friends"). "صحاب" with no article is intentional. |
| `friends.actionFor` | {{action}}, {{name}} | {{action}}، {{name}} | Kept |
| `friends.confirm.removeTitle` | Remove friend | نحّي صاحب | Kept |
| `friends.confirm.removeBody` | Remove {{name}} from your friends? | تحب تنحّي {{name}} من صحابك؟ | Kept |
| `friends.confirm.remove` | Remove | نحّي | Kept |
| `friends.confirm.blockTitle` | Block {{name}}? | تبلوكي {{name}}؟ | Kept |
| `friends.confirm.blockBody` | They can't send you friend requests. They're removed from your friends and recent players, and their emotes are muted at the table. | ما عادش ينجم يبعثلك طلبات صحبة. يتنحّى من صحابك ومن اللي لعبت معاهم، والإيموجي متاعو يتسكّت على الطاولة. | Kept |
| `friends.confirm.block` | Block | بلوكي | Kept |
| `friends.confirm.cancel` | Cancel | بطّل | Kept. Same as `common.cancel`. |
| `friends.availability.online` | Online | متّصل | Kept. Same as `online.connected`. |
| `friends.availability.room` | In a room | في طاولة خاصّة | Kept |
| `friends.availability.playing` | In a game | قاعد يلعب | **Changed** from "يلعب". "قاعد يلعب" is the natural Derja progressive (as in `room.cutting` "قاعد يقصّ"). |
| `friends.availability.offline` | Offline | موش متّصل | Kept. Same as `lobby.offline` and `seat.offline`. |
| `friends.empty.incoming` | No friend requests. | ما فمّا حتّى طلب. | Kept |
| `friends.empty.outgoing` | No requests waiting for an answer. | ما فمّا حتّى طلب يستنّى في جواب. | Kept |
| `friends.empty.friends` | No friends yet. Share your code or add someone from a table. | ما عندك حتّى صاحب توّا. شارك الكود متاعك ولا زيد حد من الطاولة. | Kept |
| `friends.empty.recent` | Players you meet at online tables show up here. | اللاعبين اللي تلقاهم في الطاولات على الإنترنت يظهرو هوني. | Kept |
| `friends.empty.blocked` | You haven't blocked anyone. | ما بلوكيت حتّى حد. | Kept |
| `friends.errors.friend_bad_request` | That request couldn't be sent. | ما نجمناش نبعثو الطلب هذا. | Kept |
| `friends.errors.friend_outgoing_limit` | You have 50 pending requests. Wait for some answers or cancel a few. | عندك 50 طلب يستنّاو. استنّى يجاوبوك ولا بطّل شويّة منهم. | Kept (tests assert "عندك 50 طلب يستنّاو"). |
| `friends.errors.friend_limit` | You already have 200 friends. | عندك ديجا 200 صاحب. | Kept |
| `friends.errors.friend_their_limit` | This player already has 200 friends. | اللاعب هذا عندو ديجا 200 صاحب. | Kept |
| `friends.errors.not_found` | No player with this code | ما فمّاش لاعب بالكود هذا | Kept |
| `friends.errors.network` | Couldn't reach the server. Check your connection and try again. | ما نجمناش نوصلو للسرفور. ثبّت في الكونكسيون وعاود جرّب. | Kept. Same as `finding.unreachable`. |
| `friends.toast.request` | {{name}} sent you a friend request | {{name}} بعثلك طلب صحبة | Kept |
| `friends.toast.accepted` | {{name}} accepted your request | {{name}} قبل الطلب متاعك | Kept |
| `friends.sheet.title` | {{name}} | {{name}} | Kept |
| `friends.sheet.add` | Add friend | زيدو صاحب | Kept |
| `friends.sheet.requestSent` | Request sent | الطلب تبعث | Kept |
| `friends.sheet.friends` | Friends | صحاب | Kept |
| `friends.sheet.accept` | Accept request | اقبل الطلب | Kept |
| `friends.sheet.block` | Block | بلوكي | Kept |
| `friends.sheet.unblock` | Unblock | نحّي البلوك | Kept |
| `friends.sheet.muted` | Emotes muted | الإيموجي مسكّتة | Kept. Same as `emotes.muted`. |
| `friends.sheet.open` | {{name}}: player options | {{name}}: خيارات اللاعب | Kept |
| `friends.sheet.loading` | Checking… | نثبّتو… | Kept |

## Appendix: table invites (`invite.*`, Task 7.I)

Scope: all 18 `invite.*` keys. 11 changed, 7 kept. Every placeholder is unchanged; `_one`/`_other` stay paired, and `catalogs.test.ts` enforces both.

**Term change.** The family moved from عيّط / عيطة to دعوة / دعا. The verb عيّط is ordinary Derja, but the noun عيطة reads as "a shout/cry", which is weak for an invitation to a table. دعوة is the standard invitation noun (as in "دعوة أصدقائك"), and دعا / يدعيك is the matching Derja verb. The swap is applied everywhere, so no sentence mixes the two families.

| key | English | old | final | note |
|---|---|---|---|---|
| `invite.button` | Invite friends | عيّط لصحابك | دعوة صحابك | New term |
| `invite.sheetTitle` | Invite friends | عيّط لصحابك | دعوة صحابك | Matches the button |
| `invite.invite` | Invite | عيّطلو | دعوة | **Flag 1** |
| `invite.invited` | Invited | تعيّطلو | دعيتو | **Flag 2** |
| `invite.banner` | {{name}} invites you to a table | {{name}} يعيّطلك تلعب معاه في طاولة | {{name}} يدعيك تلعب معاه في طاولة | **Flag 4** |
| `invite.toast` | {{name}} invites you to a table | {{name}} يعيّطلك تلعب معاه في طاولة | {{name}} يدعيك تلعب معاه في طاولة | Must stay identical to the banner |
| `invite.badge_one` | {{count}} table invite | {{count}} عيطة لطاولة | {{count}} دعوة لطاولة | |
| `invite.badge_other` | {{count}} table invites | {{count}} عيطات لطاولة | {{count}} دعوات لطاولة | **Flag 5** |
| `invite.errors.invite_bad_request` | That invite couldn't be sent. | ما نجمناش نبعثو العيطة هاذي. | ما نجمناش نبعثو الدعوة هاذي. | Feminine agreement |
| `invite.errors.invite_not_friend` | You can only invite friends. | تنجم تعيّط كان لصحابك. | تنجم تدعي كان صحابك. | **Flag 3** |
| `invite.errors.invite_rate_limited` | Too many invites. Try again in a few minutes. | برشا عيطات. استنّى شويّة دقايق وعاود جرّب. | برشا دعوات. استنّى شويّة دقايق وعاود جرّب. | |

Kept, with no invite term in them: `invite.empty` (reuses the friends vocabulary), `invite.join` `ادخل`, `invite.dismiss` `خلّيها`, `invite.closed` and `invite.errors.invite_room_not_found` (both الطاولة هاذي تسكّرت, matching `errors.match_ended`), `invite.errors.invite_not_member`, and `invite.errors.network` (identical to `friends.errors.network`).

### Flags for the native speaker

1. **`invite.invite` = دعوة** — the noun pressed into service as an action button. The alternative is the more dialectal دعّيه ("invite him"), which is less readable without diacritics.
2. **`invite.invited` = دعيتو** — reads as "I invited him", but unvocalised it can also read "you invited him". The alternative دعّيتو is more explicit.
3. **`invite.errors.invite_not_friend` = تنجم تدعي كان صحابك.** — تدعي is homographic with "you claim". A fuller form that avoids it: ما تنجمش تدعي غير صحابك.
4. **`invite.banner` / `invite.toast` = يدعيك** — the natural Derja present of دعا, but it can also mean "calls you", as the old verb did. The rest of the sentence (تلعب معاه في طاولة) disambiguates.
5. **`invite.badge_other` = دعوات** — right for 2–10; for 11+ Arabic wants the singular. The badge caps at "9+", so this should not surface. Note the catalog is not uniform here: the friend-request badge stays singular ({{count}} طلب صحبة), while this one is plural. Pick whichever you prefer and the two can be aligned.

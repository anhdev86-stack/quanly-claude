# Claude Account Switcher

Đổi giữa nhiều tài khoản Claude Code **mà bạn sở hữu hợp pháp**, không phải logout/login thủ công mỗi lần. Chạy trên macOS và Windows.

> **Mới dùng lần đầu?** Đọc [HUONG-DAN.md](HUONG-DAN.md) — hướng dẫn từng bước thêm tài khoản, đổi qua lại và xử lý sự cố.

## Dùng thế nào

### Cài

Chạy `release\Claude Account Switcher Setup 0.1.0.exe`. Hoặc chạy thẳng từ source: `npm install` rồi `npm run dev`.

### Lưu tài khoản đầu tiên

1. **Thoát hẳn Claude Code** (đóng mọi cửa sổ và terminal đang chạy `claude`). App sẽ cảnh báo nếu phát hiện tiến trình còn sống.
2. Đăng nhập Claude Code bằng tài khoản thứ nhất — `claude` rồi `/login`.
3. Mở app. Mục **Trạng thái máy** phải hiện nơi tìm thấy login. Nếu hiện *"chưa tìm thấy login nào"* thì dừng lại, backend chưa nhận ra chỗ lưu trên máy bạn.
4. Gõ tên vào ô dưới cùng, ví dụ `Pro cá nhân`, bấm **Lưu login hiện tại**.

### Lưu tài khoản thứ hai

5. Trong Claude Code: `/logout`, rồi `/login` bằng tài khoản thứ hai.
6. Quay lại app, gõ tên khác, bấm **Lưu login hiện tại** lần nữa.

Lặp lại cho từng tài khoản. Mỗi lần lưu là một hồ sơ độc lập.

### Đổi qua lại

7. Thoát Claude Code.
8. Bấm **Chuyển sang** ở hồ sơ muốn dùng. App cất login hiện tại vào đúng hồ sơ của nó rồi đặt hồ sơ đích vào chỗ Claude Code đọc.
9. Mở lại Claude Code — đã là tài khoản mới, không cần `/login`.

### Làm tiếp việc đang dở

Mục **Phiên gần đây** liệt kê các phiên kèm lệnh `claude --resume <id>`. Bấm vào dòng lệnh là copy. Transcript nằm ở local nên đổi tài khoản không làm mất hội thoại.

## Phạm vi

Công cụ này **không** tự động xoay tài khoản khi chạm giới hạn sử dụng. Việc tự nhảy account để tiêu thụ xuyên qua quota là lách usage limit của nhà cung cấp, nên chủ ý không được cài đặt. Mọi lần đổi đều do bạn bấm nút.

## Cách hoạt động

- **Park & restore.** Khi bạn đổi hồ sơ, login đang hoạt động được chụp lại và cất vào đúng hồ sơ của nó trước, rồi hồ sơ đích mới được đặt vào nơi Claude Code đọc. Park trước nghĩa là token vừa refresh trong lúc hồ sơ đó đang active sẽ không bị mất.
- **Credential là blob mờ.** App không parse, không diễn giải nội dung token — chỉ sao chép nguyên bytes.
- **Mã hoá.** Mỗi hồ sơ được seal bằng AES-256-GCM. Master key 32 byte được bọc bởi `safeStorage` của Electron: DPAPI trên Windows, Keychain trên macOS. Key không bao giờ nằm dạng thô trên đĩa.
- **Vault.** `vault.json` trong thư mục userData của app. Metadata (tên hồ sơ, thời điểm dùng) để cleartext; credential thì không.

### Nơi tìm login

| Nền tảng | Backend |
|---|---|
| macOS | Keychain, service `Claude Code-credentials` |
| Windows | Credential Manager, mọi generic credential khớp `*Claude*` |
| Linux / fallback | `~/.claude/.credentials.json` |

Việc dò là **lúc chạy**, không hardcode theo máy build. Trên Windows app liệt kê theo tiền tố thay vì ghim đúng một tên entry, vì tên này không có tài liệu và đã đổi giữa các bản phát hành. App báo rõ nó tìm thấy gì.

Credential Manager không có CLI trả về blob của generic credential, nên backend Windows P/Invoke `advapi32` (`CredEnumerateW` / `CredReadW` / `CredWriteW`) qua PowerShell. Cách này giữ app **không có native module**, nhờ đó một checkout build được cho cả hai hệ.

## Trạng thái kiểm thử

| Phần | Trạng thái |
|---|---|
| Vault, mã hoá, IPC | Đã chạy thật — vault tạo được, safeStorage hoạt động |
| Thống kê tiêu thụ | Đã chạy thật — đối chiếu khớp 2.784 lượt / 278M token (7 ngày) |
| Build + đóng gói Windows | Đã chạy thật — ra installer NSIS |
| **Backend Windows Credential Manager** | **Chưa chạy thử lần nào** |
| Backend macOS Keychain | Chưa chạy thử (không có máy macOS) |
| Giao diện | Chưa xác nhận bằng mắt |

`wincred.ts` được viết theo đúng tài liệu Win32 nhưng **chưa từng thực thi**. Chạy lần đầu nên dùng một tài khoản phụ, đừng dùng tài khoản chính.

## Mức tiêu thụ

App hiển thị lượng token **đã tiêu thụ** theo từng hồ sơ, trong cửa sổ 5 giờ và 7 ngày.

Số liệu được tính từ transcript local ở `~/.claude/projects/*.jsonl` — mỗi lượt assistant có sẵn `message.usage` (input, output, cache read, cache write) kèm `model` và `timestamp`. Đây là dữ liệu thật, không ước lượng.

Việc quy một lượt về đúng hồ sơ dựa trên **lịch sử chuyển** lưu trong vault: hồ sơ đang active tại thời điểm của lượt đó. Những lượt phát sinh trước khi app được cài sẽ không quy được về hồ sơ nào và được gom riêng.

**Đây không phải quota còn lại.** Claude Code không cung cấp API hay cache nào để đọc hạn mức thật — `/usage` gọi endpoint nội bộ không có tài liệu. App cố tình không hiện con số "còn lại" thay vì đoán. Đối chiếu bằng `/usage` trong Claude Code.

### Gợi ý chuyển

Khi hồ sơ đang dùng đã tiêu thụ nhiều hơn một hồ sơ khác trong 5 giờ qua, app hiện gợi ý kèm nút chuyển. **App không bao giờ tự chuyển** — luôn cần bạn bấm. Công cụ báo cáo trạng thái, không che giấu giới hạn.

## Phiên làm việc

Transcript nằm ở `~/.claude/projects/` dưới dạng file local và không gắn với tài khoản nào, nên đổi hồ sơ không làm mất hội thoại. App liệt kê phiên gần đây và lệnh `claude --resume <id>` tương ứng — bấm vào là copy.

## Chạy

```bash
npm install
npm run dev          # dev, hot reload
npm run build        # typecheck + bundle
npm run pack:win     # đóng gói .exe (NSIS)
npm run pack:mac     # đóng gói .dmg
```

Đóng gói cho macOS phải chạy **trên** máy macOS; `electron-builder` không cross-build được target mac từ Windows.

`win.signAndEditExecutable` để `false` vì bộ `winCodeSign` của electron-builder chứa symlink thư viện macOS, mà giải nén symlink trên Windows cần Developer Mode hoặc quyền admin. Build local không ký thì không cần bộ đó. Nếu sau này bạn ký thật, bật lại cờ này và bật Developer Mode.

## Lưu ý vận hành

- **Thoát Claude Code trước khi đổi.** Tiến trình đang chạy có thể giữ credential cũ trong bộ nhớ và ghi đè lại khi thoát.
- Backend file sẽ tạo bản `.bak` một tầng trước khi ghi, phòng khi tiến trình chết giữa chừng.
- Xoá hồ sơ là **không hoàn tác được** — credential đã seal bị xoá cùng lúc.

## Giấy phép

MIT

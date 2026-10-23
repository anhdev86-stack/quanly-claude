# Hướng dẫn dùng Claude Account Switcher

Tài liệu này hướng dẫn thêm tài khoản và đổi qua lại. Phần kỹ thuật nằm ở [README.md](README.md).

---

## Trước khi bắt đầu

**Đọc phần này trước, đừng bỏ qua.**

Backend đọc/ghi Windows Credential Manager **chưa từng được chạy thử**. Nó được viết theo đúng tài liệu Win32 nhưng chưa ai thực thi lần nào. Lần đầu dùng:

- Thử với **tài khoản phụ** trước. Đừng lấy tài khoản chính ra thử.
- Nếu app báo *"chưa tìm thấy login nào"* → dừng lại, báo tôi. Đừng cố bấm tiếp.

Backend macOS Keychain cũng ở tình trạng tương tự.

---

## Bước 0 — Cài

**Cách 1, dùng installer:**

Chạy `release\Claude Account Switcher Setup 0.1.0.exe`.

Windows SmartScreen sẽ cảnh báo vì app không ký số. Bấm **More info** → **Run anyway**.

**Cách 2, chạy từ source:**

```powershell
npm install
npm run dev
```

---

## Bước 1 — Thêm tài khoản đầu tiên

### 1.1. Thoát hẳn Claude Code

Đóng mọi cửa sổ Claude Code và mọi terminal đang chạy `claude`.

> **Vì sao bắt buộc:** tiến trình Claude Code đang chạy giữ credential trong bộ nhớ và có thể ghi đè nó lại lúc thoát. Nếu bạn đổi hồ sơ trong khi nó còn sống, lần đổi sẽ bị hoàn tác âm thầm và bạn không hiểu vì sao.

App có cảnh báo vàng khi phát hiện `claude.exe` còn chạy. Thấy cảnh báo đó thì đóng Claude Code rồi mở lại app.

### 1.2. Đăng nhập tài khoản thứ nhất

```powershell
claude
```

Trong Claude Code gõ `/login`, đăng nhập bằng tài khoản thứ nhất. Xong thì **thoát Claude Code**.

### 1.3. Mở app và kiểm tra

Mở Claude Account Switcher. Nhìn mục **Trạng thái máy**:

| Hiện gì | Nghĩa là |
|---|---|
| `windows-credential-manager` | Tốt, tìm thấy login |
| `file` | Tốt, tìm thấy login dạng file |
| `chưa tìm thấy login nào` | **Dừng lại.** Backend chưa nhận ra chỗ lưu trên máy bạn |

### 1.4. Lưu

Gõ tên vào ô dưới cùng — đặt tên dễ phân biệt, ví dụ:

- `Pro cá nhân`
- `Max công ty`
- `Client A`

Bấm **Lưu login hiện tại**. Hồ sơ xuất hiện trong danh sách và được đánh dấu *đang dùng*.

---

## Bước 2 — Thêm tài khoản thứ hai

### 2.1. Đăng xuất khỏi tài khoản hiện tại

Mở Claude Code, gõ:

```
/logout
```

### 2.2. Đăng nhập tài khoản mới

```
/login
```

Đăng nhập bằng tài khoản thứ hai. Thoát Claude Code.

### 2.3. Lưu thành hồ sơ mới

Quay lại app, gõ **tên khác**, bấm **Lưu login hiện tại**.

> Nhớ đổi tên. Đặt trùng tên không bị lỗi nhưng sau này bạn không phân biệt được hồ sơ nào với hồ sơ nào.

### 2.4. Lặp lại

Làm lại 2.1 → 2.3 cho từng tài khoản còn lại.

---

## Bước 3 — Đổi qua lại

1. **Thoát Claude Code.**
2. Trong app, bấm **Chuyển sang** ở hồ sơ muốn dùng.
3. Mở lại Claude Code.

Xong. Không cần `/login`, đã là tài khoản mới.

### Chuyện gì xảy ra khi bấm Chuyển sang

App làm hai việc theo thứ tự:

1. **Cất (park)** login đang hoạt động vào đúng hồ sơ của nó
2. **Đặt** hồ sơ đích vào chỗ Claude Code đọc

Bước 1 quan trọng: nếu token vừa được làm mới trong lúc hồ sơ đó đang dùng, bản mới sẽ được giữ lại thay vì bị bản cũ đè lên.

---

## Bước 4 — Làm tiếp việc đang dở

Đổi tài khoản **không làm mất hội thoại**. Transcript nằm ở local trong `~/.claude/projects/` và không gắn với tài khoản nào.

Mục **Phiên gần đây** trong app liệt kê các phiên gần nhất kèm lệnh resume. Bấm vào dòng lệnh màu cam là copy vào clipboard, dán vào terminal:

```powershell
claude --resume <session-id>
```

---

## Mục "Mức tiêu thụ theo hồ sơ"

Bảng này hiện **lượng token đã tiêu thụ**, không phải quota còn lại.

| Cột | Ý nghĩa |
|---|---|
| 5 giờ qua | Token đã dùng trong 5 giờ gần nhất |
| 7 ngày qua | Token đã dùng trong 7 ngày gần nhất |
| Lượt | Số lượt assistant trong 7 ngày |

**Đây không phải hạn mức còn lại.** Claude Code không cung cấp API nào để đọc quota thật, nên app không hiện con số đó thay vì đoán bừa. Muốn xem hạn mức thật, gõ `/usage` trong Claude Code.

Khi hồ sơ đang dùng đã tiêu thụ nhiều hơn một hồ sơ khác, app hiện gợi ý kèm nút chuyển. **App không bao giờ tự chuyển** — luôn cần bạn bấm.

Những lượt phát sinh *trước khi* bạn cài app sẽ không quy được về hồ sơ nào, app gom riêng và ghi chú bên dưới bảng.

---

## Xử lý sự cố

### "Chưa tìm thấy login nào"

Backend chưa nhận ra chỗ Claude Code lưu credential trên máy bạn. Chạy lệnh sau rồi gửi kết quả cho tôi:

```powershell
cmdkey /list | Select-String "Claude"
Test-Path "$env:USERPROFILE\.claude\.credentials.json"
```

### Đổi hồ sơ xong nhưng Claude Code vẫn là tài khoản cũ

Gần như chắc chắn do Claude Code còn chạy lúc bạn bấm chuyển. Thoát hẳn, bấm chuyển lại, rồi mới mở Claude Code.

### Bấm Chuyển sang thì báo lỗi

Chụp lại nguyên văn thông báo lỗi. Nếu lỗi có chữ `CredWrite failed` kèm mã số, đó là backend Windows chưa chạy đúng — gửi tôi mã lỗi đó.

### Lỡ xoá nhầm hồ sơ

Không khôi phục được. Credential đã mã hoá bị xoá cùng lúc với hồ sơ. Phải `/login` lại từ đầu rồi lưu lại.

---

## Lưu ý an toàn

- Credential được mã hoá **AES-256-GCM**. Khoá chính do Windows DPAPI (hoặc macOS Keychain) giữ, gắn với tài khoản Windows của bạn.
- Vault nằm ở `%APPDATA%\claude-account-switcher\vault.json`. Chép file này sang máy khác **sẽ không dùng được** — khoá không đi theo.
- Tên hồ sơ và thời điểm dùng để dạng thường. Credential thì không.
- App **không** gửi gì lên mạng. Không server, không telemetry.

---

## Giới hạn đã biết

| Việc | Trạng thái |
|---|---|
| Đổi tài khoản trên Windows | Chưa chạy thử |
| Đổi tài khoản trên macOS | Chưa chạy thử |
| Đóng gói bản macOS | Phải chạy `npm run pack:mac` trên máy Mac |
| Hiện quota còn lại | Không làm được — không có API |
| Tự động đổi khi hết quota | Cố ý không làm |

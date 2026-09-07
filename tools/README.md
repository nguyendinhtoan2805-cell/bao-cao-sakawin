# Công cụ kiểm trước khi đẩy

## `soat-ham.js`

Quét mọi định danh được **gọi như hàm** mà không được khai trong chính file đó.

```bash
node tools/soat-ham.js
```

**Vì sao cần:** `require()` chỉ bắt lỗi cú pháp, không bắt được `ReferenceError`
vì lỗi đó chỉ nổ lúc chạy. Đã vấp hai lần và cả hai lần đều làm cả trang không
đọc được dữ liệu:

- `lich is not defined` — một phép thay trong script sửa file bị trượt, biến
  không được khai nhưng chỗ dùng thì đã vào file
- `dsCot is not defined` — gọi hàm chỉ có ở `nhan-su.js`, quên rằng
  `tuyen-dung.js` cố ý viết độc lập không dùng chung hàm

Bộ soát bỏ comment và nội dung chuỗi trước khi quét, nhưng vẫn giữ phần `${...}`
trong template literal vì đó là code thật. Tên một chữ cái bị bỏ qua vì gần như
luôn là nhiễu.

**Còn báo giả:** vài chữ trong chuỗi tiếng Việt có dấu ngoặc đơn ngay sau
(ví dụ `Offline (`) vẫn lọt lưới. Đọc tên hàm là biết ngay có thật hay không.

## Ba việc luôn làm trước khi đẩy

```bash
node -e "require('./api/<file>.js')"                    # cú pháp API
node tools/soat-ham.js                                   # hàm chưa khai
# và soát class dùng-vs-định-nghĩa cho file .html
```

Sau khi đẩy, **kiểm deploy bằng NỘI DUNG** — tìm đúng đoạn code vừa thêm trên
production, không tin mã HTTP 200. Vercel đã bỏ qua push hai lần trong dự án này.

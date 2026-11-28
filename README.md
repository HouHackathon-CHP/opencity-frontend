<div align="center">

# OpenCity Web Portal — Layer 3

**Cổng Dịch vụ Công dân Thông minh & Bảng Điều hành Đô thị trên nền DX-OS**

<p>
  <a href="#gioi-thieu">Giới thiệu</a> &bull;
  <a href="#tinh-nang">Tính năng Thực tế</a> &bull;
  <a href="#cong-nghe">Công nghệ</a> &bull;
  <a href="#cau-truc">Cấu trúc Dự án</a> &bull;
  <a href="#cai-dat">Cài đặt</a> &bull;
  <a href="#tai-khoan">Tài khoản Demo</a> &bull;
  <a href="#thanh-vien">Đội ngũ</a>
</p>

<p>
  <img src="https://img.shields.io/badge/License-Apache_2.0-0f172a?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/MapLibre_GL-6.16-396CB2?style=flat-square" alt="MapLibre GL">
</p>

</div>

---

## Giới thiệu <a id="gioi-thieu"></a>

**OpenCity Web Portal** là giao diện web phục vụ cả **người dân** và **cán bộ điều hành đô thị**, kết nối tới [OpenCity Backend](https://github.com/HouHackathon-CHP/opencity-backend) thông qua API Gateway và xác thực SSO Keycloak của [DX-OS Core](https://github.com/HouHackathon-CHP/dxos-core).

Ứng dụng tổ chức theo mô hình *service-hub* hiện đại với **60 khái niệm dịch vụ thuộc 12 nhóm danh mục**, trong đó **23 dịch vụ đã kết nối API hoạt động end-to-end**. Dự án sử dụng nhận diện riêng và dữ liệu mở / dữ liệu kiểm thử `[DEMO]`, không gắn nhãn hiệu hay kết nối trực tiếp vào hệ thống nội bộ của cơ quan nhà nước.

---

## Tính năng Thực tế <a id="tinh-nang"></a>

### 1. Cổng Dịch vụ Công dân & Tìm kiếm Thông minh (`/`)
* **Danh mục 60 dịch vụ đô thị (`services/catalog.json`)**: Tìm kiếm tiếng Việt không dấu, lọc theo 12 nhóm danh mục, đánh dấu yêu thích cục bộ trên trình duyệt.
* **Truy cập Công khai không cần Đăng nhập**: Khách vãng lai có thể xem ngay tin tức, cảnh báo, đường dây nóng, chất lượng không khí, tuyến xe buýt, bãi đỗ xe, bản đồ 126 xã/phường, du lịch và y tế/giáo dục.

### 2. Hệ thống Bản đồ 2D/3D Tương tác (MapLibre GL JS + OpenStreetMap)
* **Quan trắc Không khí (`/air-quality`)**: Hiển thị toàn bộ các trạm đo WAQI tại Hà Nội, tự động căn khung bản đồ, biểu đồ lịch sử 24 giờ, phân loại VN-AQI theo QCVN kèm khuyến nghị sức khỏe; cán bộ có nút đồng bộ WAQI tức thì, thêm/sửa/ẩn trạm và phát cảnh báo.
* **Bản đồ 126 Xã/Phường Hà Nội (`/ward-map`)**: Chuyển đổi linh hoạt góc nhìn **2D / 3D**, tô nổi bật ranh giới đang chọn, tra cứu diện tích, dân số ước tính, trụ sở UBND và đường dây nóng; hỗ trợ modal thêm/sửa thông tin cho cán bộ `digital_ward_operator` / `admin`.
* **Xe buýt & Bãi đỗ xe (`/bus-search`, `/parking`)**: Tìm tuyến/trạm dừng xe buýt, gợi ý chuyển tuyến kèm lộ trình đi bộ; bản đồ bãi đỗ xe hiển thị đa giác phạm vi 3D, lọc theo sức chứa, phí, 24/7, bảo vệ và chỉ đường OpenStreetMap.
* **Du lịch, Di tích, Y tế & Giáo dục (`/tourism`, `/heritage`, `/healthcare`, `/education`)**: Tra cứu trực quan trên bản đồ kèm bộ lọc phân loại và thanh phân trang đánh số.

### 3. Phản ánh Hiện trường, SLA Dashboard & Thông báo
* **Công dân (`/reports`, `/reports/map`)**: Gửi phản ánh kèm ảnh chụp và vị trí GPS, theo dõi tiến trình xử lý chi tiết và bản đồ phân bố phản ánh.
* **Cán bộ Điều phối & Xử lý (`/reports/dashboard`)**: Thống kê theo thời gian thực hồ sơ mới, đang xử lý, chưa phân công, sắp đến hạn 24 giờ và quá hạn; yêu cầu gợi ý điều phối từ AI Triage; hộp thư thông báo tự làm mới mỗi 30 giây.

### 4. Hành chính Công, Cộng đồng & Quản trị
* Đặt lịch tiếp công dân (`/appointments`), khảo sát ý kiến (`/surveys`), phản ánh thủ tục hành chính (`/administrative-feedback`), kiến nghị doanh nghiệp (`/business-feedback`), đường dây nóng (`/hotlines`), truyền thông (`/communications`), nhóm cộng đồng (`/community/groups`), phản biện xã hội (`/social-feedback`) và bảng điều khiển `/admin`.
* **Xác thực OIDC Authorization Code + PKCE**: Hỗ trợ cả **Đăng nhập** và **Đăng ký công dân** trực tiếp qua Keycloak (`dxos-web`), ẩn/hiện trang quản trị dựa trên `GET /me/capabilities`.

---

## Công nghệ Sử dụng <a id="cong-nghe"></a>

| Thành phần | Công nghệ | Vai trò |
| --- | --- | --- |
| **Core UI** | React `19` + TypeScript `5.7` + Vite `6` | Giao diện SPA tốc độ cao, kiểm tra kiểu chặt chẽ. |
| **Routing** | `react-router-dom` `v7` | Điều hướng phân trang và phân quyền theo route (`FeatureRoute`, `AdminRoute`). |
| **Maps** | `maplibre-gl` `v6.16` | Render bản đồ vector 2D/3D, đa giác ranh giới và marker tương tác. |
| **Auth** | `oidc-client-ts` `v3.2` | Xác thực OIDC + PKCE S256 trực tiếp với Keycloak. |
| **Icons** | `lucide-react` | Bộ icon vector nhẹ, đồng bộ toàn giao diện. |

---

## Cấu trúc Dự án <a id="cau-truc"></a>

```text
opencity-frontend/
├── services/
│   └── catalog.json       # Định nghĩa 60 khái niệm dịch vụ thuộc 12 danh mục
├── scripts/
│   ├── check-catalog.mjs  # Kiểm tra tính hợp lệ của catalog.json
│   └── check-licenses.mjs # Kiểm toán giấy phép OSI cho toàn bộ thư viện npm
├── docs/
│   ├── service-contract.md
│   └── license-audit.md
└── src/
    ├── components/        # AuthProvider, Shell (header/drawer), Pagination, Logo
    ├── lib/               # api.ts (Gateway client + JWT headers), catalog.ts, permissions.ts
    ├── pages/             # 24 trang nghiệp vụ (AirQuality, WardMap, Parking, BusSearch, Reports, Admin...)
    ├── main.tsx           # Định nghĩa route & khởi tạo ứng dụng
    └── style.css          # Design system, responsive layout & map styling
```

---

## Hướng dẫn Cài đặt & Chạy Local <a id="cai-dat"></a>

1. Khởi chạy stack `dxos-core` + `opencity-backend` và chạy `python scripts/smoke.py`, `python scripts/smoke_app.py` theo hướng dẫn của Backend.
2. Tại thư mục `opencity-frontend`:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run check:catalog
npm run check:licenses
npm run dev
```

Mở **`http://localhost:3000`** *(luôn dùng `localhost`, không dùng `127.0.0.1` để khớp origin OIDC đã đăng ký trên Keycloak `dxos-web` và `CORS_ORIGINS` của Gateway)*.

* Để tùy chỉnh nguồn tile bản đồ khi build production, cấu hình biến `VITE_MAP_TILE_URL` và chạy `npm run build` để xuất gói tĩnh vào `dist/`.

---

## Tài khoản Kiểm thử theo Vai trò <a id="tai-khoan"></a>

Mật khẩu nằm trong tệp `dxos-core/.env` (không sao chép vào cấu hình frontend):

| Tài khoản | Biến mật khẩu trong `dxos-core/.env` | Trang kiểm thử |
| --- | --- | --- |
| `dxos-citizen` | `DEMO_CITIZEN_PASSWORD` | `/reports`, `/reports/map`, `/administrative-feedback`, `/business-feedback`, `/appointments` |
| `dxos-admin` | `DEMO_ADMIN_PASSWORD` | `/admin` và toàn bộ các trang quản lý |
| `dxos-dispatcher` | `DEMO_DISPATCHER_PASSWORD` | Điều phối & SLA Dashboard tại `/reports/dashboard` |
| `dxos-reports` | `DEMO_REPORTS_PASSWORD` | Phản ánh hạ tầng tại `/reports` |
| `dxos-reports-environment` | `DEMO_REPORTS_ENVIRONMENT_PASSWORD` | Phản ánh môi trường tại `/reports` |
| `dxos-air-quality` | `DEMO_AIR_QUALITY_PASSWORD` | `/air-quality` (đồng bộ WAQI, quản lý trạm, phát cảnh báo) |
| `dxos-digital-ward` | `DEMO_DIGITAL_WARD_PASSWORD` | `/digital-wards` và `/ward-map` (chỉnh sửa thông tin xã/phường) |
| `dxos-bus-search` | `DEMO_BUS_SEARCH_PASSWORD` | `/bus-search` |
| `dxos-bulletins` | `DEMO_BULLETINS_PASSWORD` | `/bulletins` |
| `dxos-surveys` | `DEMO_SURVEYS_PASSWORD` | `/surveys` |
| `dxos-appointments` | `DEMO_APPOINTMENTS_PASSWORD` | `/appointments` |
| `dxos-administrative-feedback` | `DEMO_ADMINISTRATIVE_FEEDBACK_PASSWORD` | `/administrative-feedback` |
| `dxos-business-feedback` | `DEMO_BUSINESS_FEEDBACK_PASSWORD` | `/business-feedback` |
| `dxos-hotlines` | `DEMO_HOTLINES_PASSWORD` | `/hotlines` |
| `dxos-communications` | `DEMO_COMMUNICATIONS_PASSWORD` | `/communications` |
| `dxos-community` | `DEMO_COMMUNITY_PASSWORD` | `/community/groups` |
| `dxos-social-feedback` | `DEMO_SOCIAL_FEEDBACK_PASSWORD` | `/social-feedback` |

---

## Thành viên Dự án & Đóng góp <a id="thanh-vien"></a>

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/hieutnago">
        <img src="https://github.com/hieutnago.png" width="96px" alt="Trương Ngọc Hiểu"/><br>
        <sub><b>Trương Ngọc Hiểu</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/HouHackathon-CHP">
        <img src="https://avatars.githubusercontent.com/u/168514215?v=4" width="96px" alt="Trần Trọng Chiến"/><br>
        <sub><b>Trần Trọng Chiến</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/HouHackathon-CHP">
        <img src="https://avatars.githubusercontent.com/u/100331812?v=4" width="96px" alt="Nguyễn Hà Phương"/><br>
        <sub><b>Nguyễn Hà Phương</b></sub>
      </a>
    </td>
  </tr>
</table>

1. Fork repository và tạo nhánh từ `dev`: `git checkout -b feature/ten-tinh-nang`.
2. Chạy `npm run check:catalog`, `npm run check:licenses` và `npm run build` trước khi gửi Pull Request.

Phát hành theo giấy phép **Apache License 2.0** — xem [LICENSE](LICENSE), [docs/license-audit.md](docs/license-audit.md) và [CHANGELOG.md](CHANGELOG.md).

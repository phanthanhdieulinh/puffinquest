"use strict";

/* ================= STATIC GAME DATA ================= */
/* Ported from the original client-only prototype. Kept as plain data so both
   the server (for validation / deterministic daily picks) and the frontend
   (for rendering) share one source of truth via GET /api/content. */

const PHOTO_BONUS = 2;
const CAPTION_BONUS = 1;
const REVIEW_APPROVALS_NEEDED = 2; // 1 bot pre-approval + 1 community member approval, or 2 community approvals
const REVIEWER_REWARD = 1; // Base reward for reviewing (approve or reject)
const REVIEWER_FEEDBACK_BONUS = 1; // Additional bonus for providing feedback or encouragement
const CHEER_REWARD = 1;
const COVE_DAILY_CAP = 200; // sanity cap, not a real gameplay limit

// Fun (and City Challenge) quests are decided by the 2 always-on bot
// puffineers alone — no real-user approval is required anymore. Real users
// can still swipe through the Networking Cove afterward, but that's now a
// purely social cheer/skip, decoupled from whether the quest was rewarded.
const BOT_REVIEWERS = [
  { username: "cove_bot_breezy", displayName: "Breezy Puffin" },
  { username: "cove_bot_tidal", displayName: "Tidal Puffin" }
];
const BOT_COMMENTS = ["Nice job! 🎉", "Love this!", "You've got this 🔥", "So wholesome", "Way to go!", "Great find!", "Keep it up!"];

// Daily quests are instant — no Cove review needed, so rewards stay small
// (+1 to +5) and the pool leans toward quick, varied, everyday-good habits.
const DAILY_POOL = [
  { id: "veggie", icon: "🥦", title: "Grocery Grab", desc: "Get one veggie at the store. Snap it in your bag, or the receipt line that proves it.", reward: 3 },
  { id: "bird", icon: "🐦", title: "Bird Watch", desc: "Find a bird — any bird — and get a photo of it before it flies off.", reward: 3 },
  { id: "water", icon: "💧", title: "Hydration Check", desc: "Photograph your water bottle or glass, ideally mid-sip.", reward: 1 },
  { id: "stretch", icon: "🧘", title: "Stretch Break", desc: "Take 60 seconds to stretch. A photo of you mid-stretch counts.", reward: 2 },
  { id: "exercise", icon: "🏃", title: "Move Your Body", desc: "10 minutes of any exercise — a run, a workout, a walk that gets your heart going.", reward: 5 },
  { id: "steps", icon: "🚶", title: "Take a Walk", desc: "Step out for a short walk, anywhere. Photo of the route or your shoes on the move.", reward: 3 },
  { id: "book", icon: "📚", title: "Page Turner", desc: "Photo of whatever you're currently reading, open to today's page.", reward: 2 },
  { id: "sky", icon: "🌅", title: "Sky Right Now", desc: "Step outside and photograph the sky exactly as it looks this minute.", reward: 1 },
  { id: "tidy", icon: "🧹", title: "Tidy Corner", desc: "Pick one small messy spot and photograph it looking tidier.", reward: 3 },
  { id: "kind-note", icon: "💌", title: "Kind Word", desc: "Leave a short kind note for someone. Photograph it before you give it away.", reward: 4 },
  { id: "plant", icon: "🌱", title: "Plant Check-in", desc: "Water or check on a plant, then snap a photo of it looking loved.", reward: 2 },
  { id: "litter", icon: "🚮", title: "Litter Pick", desc: "Pick up one piece of litter you spot outside. Photo of it in the bin.", reward: 3 },
  { id: "outside", icon: "🚪", title: "Step Outside", desc: "Photograph the view from just outside your front door.", reward: 1 },
  { id: "fruit", icon: "🍎", title: "Fruit Find", desc: "Photograph a piece of fruit — bonus points if you actually eat it.", reward: 1 },
  { id: "doodle", icon: "🎨", title: "Doodle Break", desc: "Doodle anything for two minutes, then photograph your masterpiece.", reward: 2 },
  { id: "laundry", icon: "🧺", title: "Laundry Day", desc: "Fold one small pile of laundry, photo of the neat result.", reward: 2 },
  { id: "sleep", icon: "😴", title: "Early Lights Out", desc: "Get to bed at a decent hour tonight. Photo of the clock, or good morning tomorrow.", reward: 4 },
  { id: "breathe", icon: "🌬️", title: "Breathing Break", desc: "60 seconds of slow, deep breaths. A photo of your calm spot counts.", reward: 1 },
  { id: "green-sip", icon: "🌱", title: "Green Sip & Reusable", desc: "Use your own reusable bottle, mug, or say no to single-use cups/straws today.", reward: 3 }
];

const GREEN_COVE_QUESTS = [
  {
    id: "donate-wear",
    icon: "🧥",
    category: "green",
    title: "Warm Feathers: Donate Good Wear",
    desc: "Donate clean, gently used clothes at verified charity drop-offs.",
    reward: 35,
    guide: [
      "1. Wash and dry all clothes thoroughly before donating.",
      "2. If possible, replace broken buttons or zips.",
      "3. Check all pockets carefully to ensure you leave no personal papers or money behind.",
      "4. Neatly fold clothes and categorize them (summer tops, winter jackets, trousers, shorts) before bagging them up."
    ],
    spots: [
      { name: "E2K Eco1 Đông Ngạc", address: "Ki ốt 05 Cửa hàng Thái Lan, Toà E1 Eco1, P. Đông Ngạc, Bắc Từ Liêm, Hà Nội", lat: 21.0854, lng: 105.7792, city: "Hanoi" },
      { name: "Tủ quần áo từ thiện Bà Triệu", address: "226 Bà Triệu, Hai Bà Trưng, Hà Nội", lat: 21.0116, lng: 105.8504, city: "Hanoi" },
      { name: "Tủ từ thiện Thái Hà", address: "70 Thái Hà, Đống Đa, Hà Nội", lat: 21.0135, lng: 105.8202, city: "Hanoi" },
      { name: "Tủ từ thiện Tây Sơn", address: "420 Tây Sơn, Đống Đa, Hà Nội", lat: 21.0042, lng: 105.8198, city: "Hanoi" },
      { name: "Tủ từ thiện Âu Cơ", address: "Trước cửa số 136 Âu Cơ, Tây Hồ, Hà Nội", lat: 21.0658, lng: 105.8344, city: "Hanoi" },
      { name: "Tủ từ thiện Vũ Ngọc Phan", address: "Ngõ 25 Vũ Ngọc Phan, Láng Hạ, Đống Đa, Hà Nội", lat: 21.0152, lng: 105.8105, city: "Hanoi" },
      { name: "Tủ từ thiện Bệnh viện Thanh Nhàn", address: "Bệnh viện Thanh Nhàn, Hai Bà Trưng, Hà Nội", lat: 21.0026, lng: 105.8596, city: "Hanoi" },
      { name: "Tủ từ thiện Trần Đăng Ninh", address: "Ngõ 123 Trần Đăng Ninh, Cầu Giấy, Hà Nội", lat: 21.0366, lng: 105.7932, city: "Hanoi" },
      { name: "Tủ từ thiện Quảng An", address: "19 đường Quảng An, Tây Hồ, Hà Nội", lat: 21.0622, lng: 105.8265, city: "Hanoi" },
      { name: "Tủ từ thiện Mai Hương", address: "Số 3 Ngõ Mai Hương, Bạch Mai, Hai Bà Trưng, Hà Nội", lat: 21.0019, lng: 105.8512, city: "Hanoi" },
      { name: "Tủ từ thiện Bệnh viện K3 Tân Triều", address: "Bệnh viện K3 Tân Triều, Thanh Trì, Hà Nội", lat: 20.9691, lng: 105.7997, city: "Hanoi" },
      { name: "Tủ từ thiện Ngọc Phách", address: "D9 Ngọc Phách, Láng Hạ, Đống Đa, Hà Nội", lat: 21.0205, lng: 105.8118, city: "Hanoi" },
      { name: "Tủ từ thiện Cầu Bươu", address: "32 Cầu Bươu, Thanh Trì, Hà Nội", lat: 20.9634, lng: 105.8087, city: "Hanoi" },
      { name: "Trạm REshare - Tiệm Thơm Nức", address: "10-12 Lê Quang Định, P.14, Bình Thạnh, TP.HCM", lat: 10.80315, lng: 106.6985, city: "HCMC" },
      { name: "Trạm REshare - ĐH KHXH&NV", address: "Khu phố 6, P. Linh Trung, TP. Thủ Đức, TP.HCM", lat: 10.87209, lng: 106.802, city: "HCMC" },
      { name: "Trạm REshare - Trung Tâm Phân Loại", address: "44 đường 24, P. Linh Đông, TP. Thủ Đức, TP.HCM", lat: 10.85113, lng: 106.74227, city: "HCMC" },
      { name: "Trạm REshare - Tô Ngọc Vân", address: "234/6 Tô Ngọc Vân, P. Linh Đông, TP. Thủ Đức, TP.HCM", lat: 10.85774, lng: 106.75002, city: "HCMC" },
      { name: "Trạm REshare - Chung Cư 4S Linh Đông", address: "Đường 30, P. Linh Đông, TP. Thủ Đức, TP.HCM", lat: 10.8465, lng: 106.7412, city: "HCMC" },
      { name: "Trạm REshare - Dĩ An (Bình Dương)", address: "Đường DT743, P. An Bình, Dĩ An, Bình Dương", lat: 10.8872, lng: 106.7583, city: "Binh Duong" },
      { name: "Trạm REshare - Thuận An (Bình Dương)", address: "Đại lộ Bình Dương, Lái Thiêu, Thuận An, Bình Dương", lat: 10.9015, lng: 106.7024, city: "Binh Duong" },
      { name: "Trạm REshare - Mega Market Q2", address: "KĐT An Phú An Khánh, P. An Phú, TP. Thủ Đức, TP.HCM", lat: 10.8002, lng: 106.7432, city: "HCMC" },
      { name: "Trạm REshare - Quận 1", address: "18A Nguyễn Thị Minh Khai, Đa Kao, Quận 1, TP.HCM", lat: 10.7892, lng: 106.7001, city: "HCMC" },
      { name: "Trạm REshare - Quận 3", address: "220 Pasteur, Võ Thị Sáu, Quận 3, TP.HCM", lat: 10.7865, lng: 106.6912, city: "HCMC" },
      { name: "Trạm REshare - Quận 7", address: "105 Tôn Dật Tiên, Tân Phú, Quận 7, TP.HCM", lat: 10.7289, lng: 106.7215, city: "HCMC" },
      { name: "The Salvation Army (Praisehaven)", address: "500 Upper Bukit Timah Rd, Singapore 678106", lat: 1.3644, lng: 103.7667, city: "Singapore" },
      { name: "The Salvation Army (Tanglin Hub)", address: "356 Tanglin Rd, Singapore 247674", lat: 1.2941, lng: 103.8153, city: "Singapore" },
      { name: "Cloop Textile Bin (City Square Mall)", address: "180 Kitchener Rd, Singapore 208539", lat: 1.3115, lng: 103.8566, city: "Singapore" },
      { name: "Greensquare Drop-off (The Grandstand)", address: "200 Turf Club Rd, Singapore 287994", lat: 1.3364, lng: 103.7942, city: "Singapore" },
      { name: "SSVP Thrift Shop", address: "501 Geylang Rd, Singapore 389459", lat: 1.3146, lng: 103.8824, city: "Singapore" },
      { name: "MINDS Shop Margaret Drive", address: "800 Margaret Dr, Singapore 149310", lat: 1.2988, lng: 103.8052, city: "Singapore" }
    ]
  },
  {
    id: "recycle-battery",
    icon: "🔋",
    category: "green",
    title: "Spark Safe: Battery Nest",
    desc: "Safely drop off old depleted batteries at certified drop-off stations.",
    reward: 30,
    bonusNote: "With 10+ eligible recyclable items, BOO gifts you a Green Living voucher for 15% off (up to 300,000 VND) in-store.",
    spots: [
      { name: "BOO 308 Bà Triệu", address: "308 Bà Triệu, Hai Bà Trưng, Hà Nội", lat: 21.0089, lng: 105.8496, city: "Hanoi" },
      { name: "BOO Aeon Mall Long Biên", address: "Aeon Mall Long Biên, 27 Cổ Linh, Long Biên, Hà Nội", lat: 21.0267, lng: 105.8998, city: "Hanoi" },
      { name: "BOO 110 Cầu Giấy", address: "110 Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội", lat: 21.0354, lng: 105.7946, city: "Hanoi" },
      { name: "Sở Tài nguyên – Môi trường TP.HCM", address: "63 Lý Tự Trọng, Bến Nghé, Quận 1, TP.HCM", lat: 10.7766, lng: 106.6997, city: "HCMC" },
      { name: "UBND Phường 9, Quận 3", address: "82 Bà Huyện Thanh Quan, P.9, Quận 3, TP.HCM", lat: 10.7816, lng: 106.6835, city: "HCMC" },
      { name: "UBND Phường 15, Quận 4", address: "132 Tôn Thất Thuyết, P.16, Quận 4, TP.HCM", lat: 10.7578, lng: 106.7082, city: "HCMC" },
      { name: "UBND Phường 17, Phú Nhuận", address: "22 Nguyễn Văn Trỗi, P.17, Phú Nhuận, TP.HCM", lat: 10.7936, lng: 106.6811, city: "HCMC" },
      { name: "UBND Phường 2, Bình Thạnh", address: "14 Phan Bội Châu, P.14, Bình Thạnh, TP.HCM", lat: 10.8016, lng: 106.6975, city: "HCMC" },
      { name: "ALBA E-Waste Bin (Plaza Singapura)", address: "68 Orchard Rd, Singapore 238839", lat: 1.3007, lng: 103.8452, city: "Singapore" },
      { name: "ALBA E-Waste Bin (Shell Boon Lay)", address: "2 Boon Lay Ave, Singapore 649960", lat: 1.3456, lng: 103.7123, city: "Singapore" },
      { name: "ALBA E-Waste Bin (Tampines Mall)", address: "4 Tampines Central 5, Singapore 529510", lat: 1.3526, lng: 103.9452, city: "Singapore" },
      { name: "ALBA E-Waste Bin (Jurong Point B1)", address: "1 Jurong West Central 2, Singapore 648886", lat: 1.3404, lng: 103.706, city: "Singapore" },
      { name: "ALBA E-Waste Bin (VivoCity L1)", address: "1 HarbourFront Walk, Singapore 098585", lat: 1.2644, lng: 103.8223, city: "Singapore" },
      { name: "ALBA E-Waste Bin (Nex Mall)", address: "23 Serangoon Central, Singapore 556083", lat: 1.3508, lng: 103.8723, city: "Singapore" }
    ]
  },
  {
    id: "recycle-carton",
    icon: "🥛",
    category: "green",
    title: "Carton Castle Crusader",
    desc: "Rinse, dry, and flatten milk/drink cartons before dropping off for eco-recycling.",
    reward: 30,
    bonusNote: "With 10+ eligible recyclable items, BOO gifts you a Green Living voucher for 15% off (up to 300,000 VND) in-store.",
    spots: [
      { name: "BOO 308 Bà Triệu", address: "308 Bà Triệu, Hai Bà Trưng, Hà Nội", lat: 21.0089, lng: 105.8496, city: "Hanoi" },
      { name: "BOO Aeon Mall Long Biên", address: "Aeon Mall Long Biên, 27 Cổ Linh, Long Biên, Hà Nội", lat: 21.0267, lng: 105.8998, city: "Hanoi" },
      { name: "BOO 110 Cầu Giấy", address: "110 Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội", lat: 21.0354, lng: 105.7946, city: "Hanoi" },
      { name: "SGRecycle Smart Station (Our Tampines Hub)", address: "1 Tampines Walk, Singapore 528523", lat: 1.3532, lng: 103.9405, city: "Singapore" },
      { name: "Carton Recycling (FairPrice Xtra AMK Hub)", address: "53 Ang Mo Kio Ave 3, Singapore 569933", lat: 1.3691, lng: 103.8485, city: "Singapore" },
      { name: "Carton Recycling (FairPrice Finest PLQ)", address: "10 Paya Lebar Rd, Singapore 409057", lat: 1.3175, lng: 103.8927, city: "Singapore" },
      { name: "SGRecycle Station (Westgate Mall)", address: "3 Gateway Dr, Singapore 608532", lat: 1.3344, lng: 103.7431, city: "Singapore" },
      { name: "Carton Recycling (Great World City)", address: "1 Kim Seng Promenade, Singapore 237994", lat: 1.2934, lng: 103.8317, city: "Singapore" }
    ]
  },
  {
    id: "adopt-animal",
    icon: "🐾",
    category: "green",
    title: "Forever Nest: Rescue a Furry Buddy",
    desc: "Foster, adopt, or volunteer/donate supplies at a certified animal rescue sanctuary.",
    reward: 40,
    spots: [
      { name: "Hanoi Pet Rescue (Trạm Cứu Hộ Chó Mèo HN)", address: "Ngõ 238 Âu Cơ, Tây Hồ, Hà Nội", lat: 21.0664, lng: 105.8322, city: "Hanoi" },
      { name: "Sân Nhà Nhiều Chó (Saigon Pet Shelter)", address: "106/11 Đường số 14, P.8, Gò Vấp, TP.HCM", lat: 10.8421, lng: 106.6635, city: "HCMC" },
      { name: "ARC Vietnam Animal Rescue", address: "Thảo Điền, TP. Thủ Đức, TP.HCM", lat: 10.8042, lng: 106.7368, city: "HCMC" },
      { name: "Love Animals Foundation (Yêu Động Vật)", address: "Nguyễn Thị Thập, Tân Phong, Quận 7, TP.HCM", lat: 10.7385, lng: 106.7088, city: "HCMC" },
      { name: "SPCA Singapore", address: "50 Sungei Tengah Rd, Singapore 699012", lat: 1.3789, lng: 103.7291, city: "Singapore" },
      { name: "SOSD Rehabilitation Centre", address: "59 Sungei Tengah Rd, Block T, Singapore 699014", lat: 1.3812, lng: 103.7285, city: "Singapore" },
      { name: "Action for Singapore Dogs (ASD) ARC", address: "80 Lim Chu Kang Lane 1, Singapore 718911", lat: 1.4285, lng: 103.7052, city: "Singapore" },
      { name: "Animal Lovers League (ALL)", address: "59 Sungei Tengah Rd, Block Q, Singapore 699014", lat: 1.3805, lng: 103.7288, city: "Singapore" },
      { name: "Causes for Animals Singapore (CAS)", address: "59 Sungei Tengah Rd, Singapore 699014", lat: 1.381, lng: 103.728, city: "Singapore" }
    ]
  },
  {
    id: "bring-bottle",
    icon: "🥤",
    category: "green",
    title: "BYO Puffin Flask: Sip Green",
    desc: "Bring your personal reusable tumbler, thermos, or bottle when buying drinks.",
    reward: 25,
    spots: [
      { name: "Times City Green Cafe", address: "SH05 Park 11, Khu đô thị Times City, Vĩnh Tuy, Hà Nội", lat: 20.9934, lng: 105.8678, city: "Hanoi" },
      { name: "Eco Drink Nguyễn Thị Diệu", address: "38A Nguyễn Thị Diệu, P. Võ Thị Sáu, Quận 3, TP.HCM", lat: 10.7761, lng: 106.6912, city: "HCMC" },
      { name: "Sơn Trà Green Sip Spot", address: "910A Ngô Quyền, P. An Hải Bắc, Sơn Trà, Đà Nẵng", lat: 16.0684, lng: 108.2341, city: "Da Nang" },
      { name: "Đà Lạt Pine Tumbler Point", address: "19 Lê Đại Hành, P.1, TP. Đà Lạt, Lâm Đồng", lat: 11.9392, lng: 108.4385, city: "Da Lat" },
      { name: "Bến Văn Đồn Refill Spot", address: "243 Bến Văn Đồn, P.2, Quận 4, TP.HCM", lat: 10.7602, lng: 106.7001, city: "HCMC" },
      { name: "Hoa Mai Puffin Cafe", address: "27 Hoa Mai, P.2, Phú Nhuận, TP.HCM", lat: 10.7981, lng: 106.6874, city: "HCMC" },
      { name: "Celadon City Eco Spot", address: "Diamond Alnata Plus, Celadon City, Tân Phú, TP.HCM", lat: 10.8038, lng: 106.6185, city: "HCMC" },
      { name: "Lê Thạch French Quarter Spot", address: "10 P. Lê Thạch, Tràng Tiền, Hoàn Kiếm, Hà Nội", lat: 21.0262, lng: 105.8558, city: "Hanoi" },
      { name: "Tân Mỹ Green Drink", address: "SH A01, 2 Nguyễn Văn Tưởng, Tân Mỹ, Quận 7, TP.HCM", lat: 10.7315, lng: 106.7214, city: "HCMC" },
      { name: "Sài Gòn Center Flask Cafe", address: "8-24 Ngô Đức Kế, Bến Nghé, Quận 1, TP.HCM", lat: 10.7735, lng: 106.7058, city: "HCMC" },
      { name: "Foreword Coffee Community (Canopy)", address: "18 Marina Gardens Dr, Singapore 018953", lat: 1.2818, lng: 103.8636, city: "Singapore" },
      { name: "Plain Vanilla Bakery (Tiong Bahru)", address: "1D Yong Siak St, Singapore 168641", lat: 1.2829, lng: 103.8306, city: "Singapore" },
      { name: "Starbucks Reserve Jewel Changi", address: "78 Airport Blvd., #02-204 Jewel Changi, Singapore 819666", lat: 1.3602, lng: 103.9897, city: "Singapore" },
      { name: "Common Man Coffee Roasters", address: "22 Martin Rd, #01-00, Singapore 239058", lat: 1.2907, lng: 103.8379, city: "Singapore" },
      { name: "PPP Coffee (Funan Mall)", address: "107 North Bridge Rd, #02-19 Funan, Singapore 179105", lat: 1.2914, lng: 103.8504, city: "Singapore" },
      { name: "The Social Kitchen (Mandai)", address: "20 Mandai Lake Rd, Singapore 729825", lat: 1.4043, lng: 103.793, city: "Singapore" }
    ]
  }
];

const CULTURE_COVE_QUESTS = [
  {
    id: "museum-wanderer",
    icon: "🏛️",
    category: "culture",
    title: "Museum Wanderer: Echoes of Time",
    desc: "Explore a museum or historical exhibition; snap your favorite artifact or architecture.",
    reward: 35,
    guide: [
      "1. Check museum opening hours and ticket/free admission policies before visiting.",
      "2. Walk respectfully through galleries and observe photography rules (no flash).",
      "3. Spend at least 20–30 minutes immersing in an exhibit that catches your curiosity.",
      "4. Snap a photo of an artwork, historical artifact, or the architectural facade."
    ],
    bonusNote: "💡 Student & senior discounts often apply; free entry on special cultural heritage days!",
    spots: [
      // Hà Nội
      { name: "Bảo tàng Lịch sử Quốc gia", address: "1 Tràng Tiền, Phan Chu Trinh, Hoàn Kiếm, Hà Nội", lat: 21.0253, lng: 105.8587, city: "Hà Nội" },
      { name: "Bảo tàng Mỹ thuật Việt Nam", address: "66 Nguyễn Thái Học, Điện Biên, Ba Đình, Hà Nội", lat: 21.0305, lng: 105.8361, city: "Hà Nội" },
      { name: "Bảo tàng Dân tộc học Việt Nam", address: "Nguyễn Văn Huyên, Quan Hoa, Cầu Giấy, Hà Nội", lat: 21.0406, lng: 105.7986, city: "Hà Nội" },
      { name: "Bảo tàng Phụ nữ Việt Nam", address: "36 Lý Thường Kiệt, Hàng Bài, Hoàn Kiếm, Hà Nội", lat: 21.0232, lng: 105.8528, city: "Hà Nội" },
      // TP. Hồ Chí Minh
      { name: "Bảo tàng Chứng tích Chiến tranh", address: "28 Võ Văn Tần, Phường 6, Quận 3, TP.HCM", lat: 10.7796, lng: 106.6922, city: "TP.HCM" },
      { name: "Bảo tàng Mỹ thuật TP.HCM", address: "97A Phó Đức Chính, Phường Nguyễn Thái Bình, Quận 1, TP.HCM", lat: 10.7701, lng: 106.6993, city: "TP.HCM" },
      { name: "Bảo tàng Lịch sử TP.HCM", address: "2 Nguyễn Bỉnh Khiêm, Bến Nghé, Quận 1, TP.HCM", lat: 10.7878, lng: 106.7052, city: "TP.HCM" },
      { name: "Bảo tàng TP. Hồ Chí Minh", address: "65 Lý Tự Trọng, Bến Nghé, Quận 1, TP.HCM", lat: 10.7760, lng: 106.6994, city: "TP.HCM" },
      // Đà Nẵng
      { name: "Bảo tàng Điêu khắc Chăm", address: "Số 02 Đường 2 Tháng 9, Bình Hiên, Hải Châu, Đà Nẵng", lat: 16.0601, lng: 108.2227, city: "Đà Nẵng" },
      // Singapore
      { name: "National Museum of Singapore", address: "93 Stamford Rd, Singapore 178897", lat: 1.2966, lng: 103.8485, city: "Singapore" },
      { name: "Asian Civilisations Museum (ACM)", address: "1 Empress Pl, Singapore 179555", lat: 1.2875, lng: 103.8519, city: "Singapore" },
      { name: "National Gallery Singapore", address: "1 St Andrew's Rd, Singapore 178957", lat: 1.2903, lng: 103.8519, city: "Singapore" },
      { name: "Singapore Art Museum (SAM at Tanjong Pagar)", address: "39 Keppel Rd, #01-02, Singapore 089065", lat: 1.2678, lng: 103.8398, city: "Singapore" },
      { name: "Peranakan Museum", address: "39 Armenian St, Singapore 179941", lat: 1.2944, lng: 103.8493, city: "Singapore" }
    ]
  },
  {
    id: "morning-pho",
    icon: "🍜",
    category: "culture",
    title: "Morning Pho: Broth of Tradition",
    desc: "Savor an authentic bowl of Pho for breakfast; snap the steaming broth, herbs, and fresh lime.",
    reward: 25,
    guide: [
      "1. Wake up early to catch the fresh morning simmered broth.",
      "2. Garnish with fresh herbs (cilantro, Thai basil), lime, and chili to taste.",
      "3. Sip the hot clear broth first to appreciate the cinnamon, star anise, and beef bone essence.",
      "4. Snap a photo of your steaming breakfast bowl before the first bite!"
    ],
    bonusNote: "💡 Traditional Pho Hanoi is delicious with crispy quẩy (dough sticks) and garlic vinegar!",
    spots: [
      // Hà Nội
      { name: "Phở Gia Truyền Bát Đàn", address: "49 Bát Đàn, Cửa Đông, Hoàn Kiếm, Hà Nội", lat: 21.0336, lng: 105.8475, city: "Hà Nội" },
      { name: "Phở Thìn Lò Đúc", address: "13 Lò Đúc, Phạm Đình Hổ, Hai Bà Trưng, Hà Nội", lat: 21.0181, lng: 105.8569, city: "Hà Nội" },
      { name: "Phở 10 Lý Quốc Sư", address: "10 Lý Quốc Sư, Hàng Trống, Hoàn Kiếm, Hà Nội", lat: 21.0298, lng: 105.8498, city: "Hà Nội" },
      // TP. Hồ Chí Minh
      { name: "Phở Hòa Pasteur", address: "260C Pasteur, Phường 8, Quận 3, TP.HCM", lat: 10.7877, lng: 106.6908, city: "TP.HCM" },
      { name: "Phở Lệ Nguyễn Trãi", address: "415 Nguyễn Trãi, Phường 7, Quận 5, TP.HCM", lat: 10.7554, lng: 106.6698, city: "TP.HCM" },
      { name: "Phở Phú Vương", address: "339 Lê Văn Sỹ, Phường 1, Tân Bình, TP.HCM", lat: 10.7937, lng: 106.6664, city: "TP.HCM" },
      // Singapore
      { name: "Mrs Pho (Beach Road)", address: "349 Beach Rd, Singapore 199570", lat: 1.3023, lng: 103.8611, city: "Singapore" },
      { name: "Long Phung Vietnamese Restaurant", address: "159 Joo Chiat Rd, Singapore 427436", lat: 1.3129, lng: 103.9022, city: "Singapore" },
      { name: "Signs A Taste Of Vietnam Pho", address: "252 North Bridge Rd, #B1-07 Raffles City, Singapore 179103", lat: 1.2938, lng: 103.8532, city: "Singapore" }
    ]
  },
  {
    id: "heritage-sanctuary",
    icon: "⛩️",
    category: "culture",
    title: "Heritage Pagoda & Sanctuary Stroll",
    desc: "Visit an ancient pagoda, temple, or historic sanctuary. Capture the peaceful architecture.",
    reward: 30,
    guide: [
      "1. Dress modestly (shoulders and knees covered) when entering temple grounds.",
      "2. Walk quietly, observe mindfulness, and admire the wood carvings and incense urns.",
      "3. Photograph courtyard archways, bells, or ancient trees without disturbing worshippers."
    ],
    bonusNote: "💡 Early morning visits offer serene atmospheres and soft natural sunlight.",
    spots: [
      // Hà Nội
      { name: "Chùa Trấn Quốc", address: "Đường Thanh Niên, Yên Phụ, Tây Hồ, Hà Nội", lat: 21.0478, lng: 105.8368, city: "Hà Nội" },
      { name: "Văn Miếu - Quốc Tử Giám", address: "58 Quốc Tử Giám, Văn Miếu, Đống Đa, Hà Nội", lat: 21.0278, lng: 105.8358, city: "Hà Nội" },
      // TP. Hồ Chí Minh
      { name: "Chùa Vĩnh Nghiêm", address: "339 Nam Kỳ Khởi Nghĩa, Phường 7, Quận 3, TP.HCM", lat: 10.7915, lng: 106.6847, city: "TP.HCM" },
      { name: "Chùa Ngọc Hoàng (Jade Emperor)", address: "73 Mai Thị Lựu, Đa Kao, Quận 1, TP.HCM", lat: 10.7919, lng: 106.6983, city: "TP.HCM" },
      // Singapore
      { name: "Buddha Tooth Relic Temple", address: "288 South Bridge Rd, Singapore 058840", lat: 1.2815, lng: 103.8443, city: "Singapore" },
      { name: "Thian Hock Keng Temple", address: "158 Telok Ayer St, Singapore 068613", lat: 1.2809, lng: 103.8475, city: "Singapore" },
      { name: "Sri Mariamman Temple", address: "244 South Bridge Rd, Singapore 058793", lat: 1.2827, lng: 103.8453, city: "Singapore" }
    ]
  },
  {
    id: "artisan-market",
    icon: "🏮",
    category: "culture",
    title: "Artisan Craft & Historic Market",
    desc: "Explore a traditional handicraft village or historic market; photograph local craftsmanship.",
    reward: 28,
    guide: [
      "1. Greet shopkeepers and artisans courteously.",
      "2. Discover traditional crafts (ceramics, woven bamboo, silk, lacquerware, or spices).",
      "3. Photograph the vibrant stalls or handmade crafts."
    ],
    spots: [
      // Hà Nội
      { name: "Làng Gốm Bát Tràng", address: "Xã Bát Tràng, Huyện Gia Lâm, Hà Nội", lat: 20.9782, lng: 105.9126, city: "Hà Nội" },
      { name: "Chợ Đồng Xuân", address: "Đồng Xuân, Hoàn Kiếm, Hà Nội", lat: 21.0384, lng: 105.8496, city: "Hà Nội" },
      // TP. Hồ Chí Minh
      { name: "Chợ Bến Thành", address: "Đường Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM", lat: 10.7725, lng: 106.6980, city: "TP.HCM" },
      { name: "Chợ Lớn (Bình Tây)", address: "57A Tháp Mười, Phường 2, Quận 6, TP.HCM", lat: 10.7503, lng: 106.6517, city: "TP.HCM" },
      // Singapore
      { name: "Chinatown Street Market", address: "Trengganu St, Singapore 058472", lat: 1.2831, lng: 103.8439, city: "Singapore" },
      { name: "Kampong Gelam / Arab Street", address: "Arab St, Singapore 199745", lat: 1.3015, lng: 103.8590, city: "Singapore" }
    ]
  }
];

const FUN_POOL = [
  { id: "sunset", icon: "🌇", title: "Sunset Chaser", desc: "Catch today's sunset. However you can see it, photograph it.", reward: 20 },
  { id: "read-learn", icon: "📖", title: "Curious Mind: Read & Learn", desc: "Read a chapter of a book, article, or learn a fascinating new skill or fact today. Snap your book or notes.", reward: 22 },
  { id: "rainbow", icon: "🌈", title: "Chase a Rainbow", desc: "Spot a rainbow, or make one with a hose or prism — capture it.", reward: 26 },
  { id: "grass", icon: "🌿", title: "Toes in the Grass", desc: "Kick off your shoes and stand in grass or sand for a minute. Snap your feet.", reward: 20 },
  { id: "kindness", icon: "🎈", title: "Random Act of Kindness", desc: "Do something small and kind for a stranger or friend. Photo of the moment or the aftermath.", reward: 30 },
  { id: "newroute", icon: "🗺️", title: "New Route Explorer", desc: "Walk or bike a route you've never taken before. Photo of somewhere new.", reward: 24 },
  { id: "stargaze", icon: "🌙", title: "Stargaze", desc: "Spend 10 minutes looking at the night sky. Photo of the sky, moon, or you looking up.", reward: 22 },
  { id: "cook", icon: "🍳", title: "Cook Something New", desc: "Make a dish or snack you've never made before. Photo of your creation.", reward: 28 },
  { id: "puzzle", icon: "🧩", title: "Finish a Puzzle", desc: "Complete a puzzle, crossword, or brain-teaser. Photo of the finished thing.", reward: 18 },
  { id: "cozy", icon: "🕯️", title: "Cozy Night In", desc: "Set up a cozy little scene for yourself tonight — blanket, drink, whatever cozy means to you.", reward: 16 },
  { id: "bike", icon: "🚲", title: "Somewhere New by Bike", desc: "Ride, scoot, or walk somewhere in your area you've genuinely never been.", reward: 24 }
];

const FIGHT_DEFS = [
  {
    key: "week",
    label: "Weekly",
    name: "Waddle Sprint",
    desc: "Complete 5 quests this week",
    target: 5,
    reward: 40,
    badgeReward: { id: "waddle-star", name: "Waddle Star", icon: "🌟", desc: "Completed a Weekly Waddle Sprint" },
    titleReward: "Swift Waddler"
  },
  {
    key: "month",
    label: "Monthly",
    name: "Puffin Tide",
    desc: "Earn 150 Puffins this month",
    target: 150,
    reward: 80,
    badgeReward: { id: "tide-champion", name: "Tide Champion", icon: "🌊", desc: "Conquered the Monthly Puffin Tide" },
    titleReward: "Puffin Monarch"
  },
  {
    key: "season",
    label: "Seasonal",
    name: "The Long Migration",
    desc: "Reach a 14-day streak this season",
    target: 14,
    reward: 200,
    badgeReward: { id: "golden-plume", name: "Golden Plume", icon: "🪶", desc: "Achieved a 14-day Seasonal streak" },
    titleReward: "Sky Voyager"
  }
];

const PUFFIN_WARDROBE_ITEMS = {
  // Hats
  "sailor-cap": { id: "sailor-cap", name: "Sailor Cap", category: "hat", icon: "⛵", visual: "🧢", desc: "A snappy nautical cap for sea voyages." },
  "flower-crown": { id: "flower-crown", name: "Daisy Wreath", category: "hat", icon: "🌸", visual: "🌸", desc: "Fresh island daisies woven with love." },
  "party-hat": { id: "party-hat", name: "Festive Hat", category: "hat", icon: "🥳", visual: "🎉", desc: "Sparkly cone hat for puffin parties!" },
  // Clothes
  "red-scarf": { id: "red-scarf", name: "Cozy Red Scarf", category: "clothes", icon: "🧣", visual: "🧣", desc: "Hand-knitted warm wool scarf." },
  "sailor-suit": { id: "sailor-suit", name: "Nautical Vest", category: "clothes", icon: "🦺", visual: "🦺", desc: "Crisp blue & white ocean vest." },
  "hero-cape": { id: "hero-cape", name: "Hero Cape", category: "clothes", icon: "🦸", visual: "🦸", desc: "Flowing coral superhero cape!" },
  // Shoes
  "yellow-boots": { id: "yellow-boots", name: "Yellow Rain Boots", category: "shoes", icon: "👢", visual: "👢", desc: "Puddle-proof bright yellow boots." },
  "sneakers": { id: "sneakers", name: "Aqua Kicks", category: "shoes", icon: "👟", visual: "👟", desc: "Sporty sneakers with wing laces." },
  "roller-skates": { id: "roller-skates", name: "Tiny Skates", category: "shoes", icon: "🛼", visual: "🛼", desc: "Four-wheel skates for speedy waddling." }
};

const PUFFIN_GROWTH_LEVELS = [
  { level: 1, name: "Tiny Fledge", minFeed: 0, scale: 1.0, icon: "🐣" },
  { level: 2, name: "Plump Puff", minFeed: 4, scale: 1.15, icon: "🐥" },
  { level: 3, name: "Chonky Waddler", minFeed: 10, scale: 1.3, icon: "🐧" },
  { level: 4, name: "Grand Navigator", minFeed: 20, scale: 1.45, icon: "👑" },
  { level: 5, name: "Glorious Chonk", minFeed: 35, scale: 1.6, icon: "🌟" }
];

function getPuffinGrowthTier(feedPoints) {
  feedPoints = feedPoints || 0;
  for (let i = PUFFIN_GROWTH_LEVELS.length - 1; i >= 0; i--) {
    if (feedPoints >= PUFFIN_GROWTH_LEVELS[i].minFeed) {
      const current = PUFFIN_GROWTH_LEVELS[i];
      const next = PUFFIN_GROWTH_LEVELS[i + 1] || null;
      return {
        level: current.level,
        name: current.name,
        icon: current.icon,
        scale: current.scale,
        feedPoints,
        nextThreshold: next ? next.minFeed : current.minFeed,
        isMax: !next
      };
    }
  }
  return PUFFIN_GROWTH_LEVELS[0];
}

const FISH_COST = 15;
const LOOT_TABLE = [
  // Fish (feeds the puffin so it grows, plus bonus Puffins)
  { id: "sprat", label: "Tiny Sprat", icon: "🐟", rarity: "common", weight: 30, type: "fish", feedPoints: 1, min: 4, max: 8 },
  { id: "herring", label: "Silver Herring", icon: "🐠", rarity: "common", weight: 26, type: "fish", feedPoints: 1, min: 8, max: 14 },
  { id: "flounder", label: "Flat Flounder", icon: "🐡", rarity: "uncommon", weight: 14, type: "fish", feedPoints: 2, min: 14, max: 22 },
  { id: "salmon", label: "King Salmon", icon: "🍣", rarity: "rare", weight: 6, type: "fish", feedPoints: 3, min: 25, max: 40 },
  { id: "golden", label: "Golden Puffin Fish", icon: "🌟", rarity: "legendary", weight: 2, type: "fish", feedPoints: 5, min: 80, max: 120 },
  // Wearable accessories (Hats, Clothes, Shoes to make the puffin prettier)
  { id: "sailor-cap", label: "Sailor Cap", icon: "⛵", rarity: "uncommon", weight: 6, type: "wardrobe", category: "hat" },
  { id: "red-scarf", label: "Cozy Red Scarf", icon: "🧣", rarity: "uncommon", weight: 6, type: "wardrobe", category: "clothes" },
  { id: "yellow-boots", label: "Yellow Rain Boots", icon: "👢", rarity: "uncommon", weight: 6, type: "wardrobe", category: "shoes" },
  { id: "flower-crown", label: "Daisy Wreath", icon: "🌸", rarity: "rare", weight: 3, type: "wardrobe", category: "hat" },
  { id: "sailor-suit", label: "Nautical Vest", icon: "🦺", rarity: "rare", weight: 3, type: "wardrobe", category: "clothes" },
  { id: "sneakers", label: "Aqua Kicks", icon: "👟", rarity: "rare", weight: 3, type: "wardrobe", category: "shoes" },
  { id: "party-hat", label: "Festive Hat", icon: "🥳", rarity: "rare", weight: 2, type: "wardrobe", category: "hat" },
  { id: "hero-cape", label: "Hero Cape", icon: "🦸", rarity: "rare", weight: 2, type: "wardrobe", category: "clothes" },
  { id: "roller-skates", label: "Tiny Skates", icon: "🛼", rarity: "legendary", weight: 1, type: "wardrobe", category: "shoes" },
  // Streak Freeze (protects streak for 1 missed day)
  { id: "streak-freeze", label: "Streak Freeze", icon: "🧊", rarity: "rare", weight: 4, type: "streak-freeze" }
];

const NAME_ADJ = ["Misty", "Salty", "Windy", "Foamy", "Pebble", "Chilly", "Reedy", "Driftwood", "Cloudy", "Tidepool", "Brisk", "Harbor", "Foggy", "Rocky", "Breezy", "Marsh"];

// City Challenge: pick a city, get one blurred/zoomed "mystery landmark" at a
// time to go find and photograph in person. Rendered as a stylized emoji
// mystery card (heavily blurred + zoomed via CSS) rather than a real scraped
// photo, so there's no landmark-photo licensing to worry about.
const ALLOWED_CITIES = ["hanoi", "hcmc", "singapore"];
const CITY_GPS_TOLERANCE_METERS = 10; // +-10 meters

const CITY_CHALLENGES = {
  hanoi: {
    name: "Hà Nội",
    landmarks: [
      {
        id: "hanoi-turtle-tower",
        icon: "🐢",
        title: "Turtle Tower",
        desc: "A little tower on an island in the Old Quarter's favorite lake.",
        refPhoto: "/landmarks/hanoi-turtle-tower.jpg",
        reward: 40,
        lat: 21.028511,
        lng: 105.852402,
        features: ["tower", "lake", "water", "island", "ancient", "stone"]
      },
      {
        id: "hanoi-one-pillar",
        icon: "🏯",
        title: "One Pillar Pagoda",
        desc: "A tiny pagoda that looks like it's floating on a single stone leg.",
        refPhoto: "/landmarks/hanoi-one-pillar.jpg",
        reward: 40,
        lat: 21.035833,
        lng: 105.833611,
        features: ["pagoda", "pillar", "lotus", "pond", "wood", "temple"]
      },
      {
        id: "hanoi-temple-literature",
        icon: "⛩️",
        title: "Temple of Literature",
        desc: "Vietnam's first university, guarded by stone turtles and old exam steles.",
        refPhoto: "/landmarks/hanoi-temple-literature.jpg",
        reward: 40,
        lat: 21.029333,
        lng: 105.835556,
        features: ["temple", "gate", "courtyard", "red", "tile", "scholar"]
      },
      {
        id: "hanoi-long-bien",
        icon: "🌉",
        title: "Long Biên Bridge",
        desc: "A century-old iron bridge stretching across the Red River, still carrying trains today.",
        refPhoto: "/landmarks/hanoi-long-bien.jpg",
        reward: 40,
        lat: 21.043056,
        lng: 105.856111,
        features: ["bridge", "iron", "steel", "river", "train", "truss"]
      },
      {
        id: "hanoi-opera-house",
        icon: "🎭",
        title: "Hanoi Opera House",
        desc: "A grand French-colonial theater with cream-yellow walls and a classic stairway entrance.",
        refPhoto: "/landmarks/hanoi-opera-house.jpg",
        reward: 40,
        lat: 21.024444,
        lng: 105.857222,
        features: ["opera", "theater", "colonial", "facade", "stairs", "columns"]
      }
    ]
  },
  hcmc: {
    name: "Ho Chi Minh City",
    landmarks: [
      {
        id: "hcmc-notre-dame",
        icon: "⛪",
        title: "Notre-Dame Cathedral Basilica",
        desc: "Red-brick towers, imported brick by brick from France.",
        refPhoto: "/landmarks/hcmc-notre-dame.jpg",
        reward: 40,
        lat: 10.779784,
        lng: 106.699018,
        features: ["cathedral", "brick", "towers", "spire", "red", "church"]
      },
      {
        id: "hcmc-ben-thanh",
        icon: "🏛️",
        title: "Bến Thành Market",
        desc: "A clock tower marks the entrance to this century-old market.",
        refPhoto: "/landmarks/hcmc-ben-thanh.jpg",
        reward: 40,
        lat: 10.772535,
        lng: 106.698032,
        features: ["clock", "market", "entrance", "yellow", "roof", "historic"]
      },
      {
        id: "hcmc-independence-palace",
        icon: "🏢",
        title: "Independence Palace",
        desc: "A 1960s government palace with a helicopter still parked on the roof.",
        refPhoto: "/landmarks/hcmc-independence-palace.jpg",
        reward: 40,
        lat: 10.777011,
        lng: 106.695318,
        features: ["palace", "modernist", "fountain", "lawn", "facade", "flag"]
      },
      {
        id: "hcmc-post-office",
        icon: "🏤",
        title: "Central Post Office",
        desc: "A beautiful colonial building with arched windows and a giant portrait hanging inside.",
        refPhoto: "/landmarks/hcmc-post-office.jpg",
        reward: 40,
        lat: 10.779889,
        lng: 106.699722,
        features: ["post", "office", "colonial", "arches", "yellow", "clock"]
      },
      {
        id: "hcmc-bitexco",
        icon: "🏙️",
        title: "Bitexco Financial Tower",
        desc: "A sleek skyscraper shaped like a lotus bud with a helipad sticking out the side.",
        refPhoto: "/landmarks/hcmc-bitexco.jpg",
        reward: 40,
        lat: 10.771389,
        lng: 106.704167,
        features: ["skyscraper", "tower", "helipad", "glass", "lotus", "modern"]
      }
    ]
  },
  singapore: {
    name: "Singapore",
    landmarks: [
      {
        id: "sg-merlion",
        icon: "🦁",
        title: "Merlion",
        desc: "Half lion, half fish, all waterspout.",
        refPhoto: "/landmarks/sg-merlion.jpg",
        reward: 40,
        lat: 1.286782,
        lng: 103.854508,
        features: ["merlion", "water", "spout", "statue", "marina", "white"]
      },
      {
        id: "sg-marina-bay-sands",
        icon: "🏨",
        title: "Marina Bay Sands",
        desc: "Three towers holding up a boat-shaped rooftop pool.",
        refPhoto: "/landmarks/sg-marina-bay-sands.jpg",
        reward: 40,
        lat: 1.283375,
        lng: 103.860726,
        features: ["skyscrapers", "boat", "skypark", "glass", "towers", "bay"]
      },
      {
        id: "sg-gardens-by-the-bay",
        icon: "🌳",
        title: "Gardens by the Bay",
        desc: "Metal supertrees that light up after dark.",
        refPhoto: "/landmarks/sg-gardens-by-the-bay.jpg",
        reward: 40,
        lat: 1.281568,
        lng: 103.863613,
        features: ["supertrees", "gardens", "canopy", "dome", "plants", "nature"]
      },
      {
        id: "sg-esplanade",
        icon: "🎪",
        title: "Esplanade – Theatres on the Bay",
        desc: "Twin durian-shaped domes right on the waterfront, covered in spiky sun shades.",
        refPhoto: "/landmarks/sg-esplanade.jpg",
        reward: 40,
        lat: 1.289722,
        lng: 103.855556,
        features: ["esplanade", "durian", "dome", "theater", "waterfront", "spikes"]
      },
      {
        id: "sg-helix-bridge",
        icon: "🌀",
        title: "Helix Bridge",
        desc: "A twisting steel pedestrian bridge inspired by DNA's double helix, glowing at night.",
        refPhoto: "/landmarks/sg-helix-bridge.jpg",
        reward: 40,
        lat: 1.286389,
        lng: 103.861111,
        features: ["bridge", "helix", "steel", "pedestrian", "dna", "lights"]
      }
    ]
  }
};

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function parseGpsString(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

function cityLandmarksFlat() {
  const out = [];
  for (const key of Object.keys(CITY_CHALLENGES)) {
    for (const l of CITY_CHALLENGES[key].landmarks) {
      out.push({
        ...l,
        cityKey: key,
        requiresPhoto: true,
        requiresGps: true,
        targetGps: l.lat + ", " + l.lng
      });
    }
  }
  return out;
}

function findQuest(id) {
  return DAILY_POOL.concat(GREEN_COVE_QUESTS).concat(CULTURE_COVE_QUESTS).concat(FUN_POOL).concat(cityLandmarksFlat()).find((q) => q.id === id);
}

/* ================= DETERMINISTIC HELPERS ================= */
/* Same seeded-shuffle approach as the original client, so "today's 4 quests"
   are identical for everyone (server is now the single source of truth). */
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seedFn) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(seedFn() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr(from) {
  const y = new Date((from || todayStr()) + "T00:00:00");
  y.setDate(y.getDate() - 1);
  return y.toISOString().slice(0, 10);
}
function dailyQuestIdsFor(dateStr) {
  const rng = hashStr("daily-" + dateStr);
  return seededShuffle(DAILY_POOL, rng).slice(0, 4).map((q) => q.id);
}
function weekStartStr(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const dayNr = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNr);
  return d.toISOString().slice(0, 10);
}
function seasonKeyStr(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const q = Math.floor(d.getMonth() / 3) + 1;
  return d.getFullYear() + "-Q" + q;
}
function nextMondayFrom(dateStr) {
  const wk = new Date(weekStartStr(dateStr) + "T00:00:00");
  wk.setDate(wk.getDate() + 7);
  return wk.toISOString();
}
function nextMonthStart(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}
function nextSeasonStart(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const q = Math.floor(d.getMonth() / 3);
  const nextQMonth = (q + 1) * 3;
  const year = d.getFullYear() + (nextQMonth >= 12 ? 1 : 0);
  return new Date(year, nextQMonth % 12, 1).toISOString();
}
function questBonus(hasPhoto, hasCaption) {
  return (hasPhoto ? PHOTO_BONUS : 0) + (hasCaption ? CAPTION_BONUS : 0);
}
function pickWeightedLoot() {
  const total = LOOT_TABLE.reduce((s, l) => s + l.weight, 0);
  let r = Math.random() * total;
  for (const loot of LOOT_TABLE) {
    r -= loot.weight;
    if (r <= 0) return loot;
  }
  return LOOT_TABLE[0];
}
const SOCIAL_PLATFORMS = {
  facebook: { label: "Facebook", icon: "📘", urlFor: (u) => `https://www.facebook.com/${u}` },
  instagram: { label: "Instagram", icon: "📸", urlFor: (u) => `https://www.instagram.com/${u}` },
  linkedin: { label: "LinkedIn", icon: "💼", urlFor: (u) => `https://www.linkedin.com/in/${u}` }
};

function buildSocialLinks(username, flags) {
  const out = {};
  for (const key of Object.keys(SOCIAL_PLATFORMS)) {
    out[key] = flags && flags[key] ? SOCIAL_PLATFORMS[key].urlFor(encodeURIComponent(username)) : null;
  }
  return out;
}

function generateRandomName() {
  const idx = Math.floor(Math.random() * NAME_ADJ.length);
  const num = 100 + Math.floor(Math.random() * 900);
  return NAME_ADJ[idx] + " Puffin #" + num;
}

module.exports = {
  PHOTO_BONUS,
  CAPTION_BONUS,
  REVIEW_APPROVALS_NEEDED,
  REVIEWER_REWARD,
  REVIEWER_FEEDBACK_BONUS,
  CHEER_REWARD,
  COVE_DAILY_CAP,
  BOT_REVIEWERS,
  BOT_COMMENTS,
  DAILY_POOL,
  GREEN_COVE_QUESTS,
  CULTURE_COVE_QUESTS,
  FUN_POOL,
  FIGHT_DEFS,
  FISH_COST,
  LOOT_TABLE,
  SOCIAL_PLATFORMS,
  ALLOWED_CITIES,
  CITY_CHALLENGES,
  CITY_GPS_TOLERANCE_METERS,
  haversineDistanceMeters,
  parseGpsString,
  cityLandmarksFlat,
  buildSocialLinks,
  findQuest,
  hashStr,
  seededShuffle,
  todayStr,
  yesterdayStr,
  dailyQuestIdsFor,
  weekStartStr,
  seasonKeyStr,
  nextMondayFrom,
  nextMonthStart,
  nextSeasonStart,
  questBonus,
  pickWeightedLoot,
  generateRandomName,
  PUFFIN_WARDROBE_ITEMS,
  PUFFIN_GROWTH_LEVELS,
  getPuffinGrowthTier
};

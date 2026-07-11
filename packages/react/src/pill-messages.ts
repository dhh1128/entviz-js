// Localization catalog for the <EntvizPill> chrome.
//
// IMPORTANT (security): only CHROME is localized here — never the copied value
// or comparison text, and never via locale-aware case operations. See
// packages/react/docs/pill-design.md §8.
//
// Non-English strings are MACHINE-DRAFTED and NEED NATIVE REVIEW. Placeholders
// in `desc` ({type} {cells} {bars} {quartiles} {bmin} {bmax} {bleft} {bright}
// {bslots}) and elsewhere ({type} {n} {unit}) must be preserved verbatim.

export interface Messages {
  view: string; // tooltip / "View visualization" menu item
  ariaView: string; // accessible label for the pill ("...{type}")
  actions: string; // kebab button aria-label
  copyValue: string;
  copyComparison: string;
  copyImage: string;
  copySvg: string;
  copiedValue: string; // "...{n} {unit}"
  copiedComparison: string; // "...{n} cells"
  copiedImage: string;
  copiedSvg: string;
  copyFailed: string;
  desc: string; // accessible per-channel description of the expanded entviz (§9)
  // --- disclosure-lifecycle chrome (the Cite · Visualize · Compare progression) ---
  stepCite: string; // rail: the collapsed inline pill (a citation of the value)
  stepVisualize: string; // rail: the expanded full render
  stepCompare: string; // rail: comparison against a supplied reference
  teachVisualize: string; // teaching header shown in the expanded (Visualize) state
  compareAction: string; // "Compare against a reference…" affordance label
  /** ✕ popover-close aria-label/tooltip. Present in every shipped locale; optional
   *  only so a host `messages` override may omit it (then it falls back to "Close"). */
  close?: string;
  // --- <Entviz> controls-toolbar chrome (the size/shape/copy strip shown in the
  //     pill's expanded Visualize state). Each falls back to English at the call
  //     site, so a partial host `messages` override is safe. ---
  /** aria-label for the font-size control group. */
  ctlSize?: string;
  /** aria-label for the − (shrink) button. */
  ctlSmaller?: string;
  /** aria-label for the + (grow) button. */
  ctlLarger?: string;
  /** aria-label for the grid-shape control. */
  ctlShape?: string;
  /** transient toast after "Copy value". */
  ctlCopiedValue?: string;
  /** transient toast after "Copy comparison text". */
  ctlCopiedComparison?: string;
  /** transient toast after "Copy image". */
  ctlCopiedImage?: string;
  /** transient toast after "Copy SVG". */
  ctlCopiedSvg?: string;
}

const en: Messages = {
  view: "View visualization",
  ariaView: "view visualization, {type}",
  actions: "Actions",
  copyValue: "Copy value",
  copyComparison: "Copy comparison text",
  copyImage: "Copy image",
  copySvg: "Copy SVG",
  copiedValue: "Copied value · {n} {unit}",
  copiedComparison: "Copied comparison text · {n} cells",
  copiedImage: "Copied image",
  copiedSvg: "Copied SVG",
  copyFailed: "Copy failed",
  desc: "Visualization channels — type {type}; cells {cells}; color bar {bars}; quartile cells {quartiles}; blank map {bmin} to {bmax}; bar markers {bleft} and {bright} of {bslots}.",
  stepCite: "Cite",
  stepVisualize: "Visualize",
  stepCompare: "Compare",
  teachVisualize: "This is the full visualization — read the cells to check a value; a glance can’t.",
  compareAction: "Compare against another value…",
  close: "Close",
  ctlSize: "size", ctlSmaller: "smaller", ctlLarger: "larger", ctlShape: "shape",
  ctlCopiedValue: "Copied value", ctlCopiedComparison: "Copied comparison text",
  ctlCopiedImage: "Copied image", ctlCopiedSvg: "Copied SVG",
};

// Full target set (incl. RTL ar/he and Simplified/Traditional Chinese).
// NOT reviewed by native speakers — demo quality.
const CATALOG: Record<string, Messages> = {
  en,
  es: { view: "Ver visualización", ariaView: "ver visualización, {type}", actions: "Acciones", copyValue: "Copiar valor", copyComparison: "Copiar texto de comparación", copyImage: "Copiar imagen", copySvg: "Copiar SVG", copiedValue: "Valor copiado · {n} {unit}", copiedComparison: "Texto de comparación copiado · {n} celdas", copiedImage: "Imagen copiada", copiedSvg: "SVG copiado", copyFailed: "Error al copiar", desc: "Canales de la visualización — tipo {type}; celdas {cells}; barra de color {bars}; celdas de cuartil {quartiles}; mapa de vacíos {bmin} a {bmax}; marcadores de barra {bleft} y {bright} de {bslots}.", stepCite: "Citar", stepVisualize: "Visualizar", stepCompare: "Comparar", teachVisualize: "Esta es la visualización completa: lee las celdas para comprobar un valor; un vistazo no basta.", compareAction: "Comparar con una referencia…", close: "Cerrar", ctlSize: "tamaño", ctlSmaller: "reducir", ctlLarger: "ampliar", ctlShape: "forma", ctlCopiedValue: "Valor copiado", ctlCopiedComparison: "Texto de comparación copiado", ctlCopiedImage: "Imagen copiada", ctlCopiedSvg: "SVG copiado" },
  fr: { view: "Voir la visualisation", ariaView: "voir la visualisation, {type}", actions: "Actions", copyValue: "Copier la valeur", copyComparison: "Copier le texte de comparaison", copyImage: "Copier l’image", copySvg: "Copier le SVG", copiedValue: "Valeur copiée · {n} {unit}", copiedComparison: "Texte de comparaison copié · {n} cellules", copiedImage: "Image copiée", copiedSvg: "SVG copié", copyFailed: "Échec de la copie", desc: "Canaux de la visualisation — type {type} ; cellules {cells} ; barre de couleur {bars} ; cellules de quartile {quartiles} ; carte des vides {bmin} à {bmax} ; marqueurs de barre {bleft} et {bright} sur {bslots}.", stepCite: "Citer", stepVisualize: "Visualiser", stepCompare: "Comparer", teachVisualize: "Voici la visualisation complète — lisez les cellules pour vérifier une valeur ; un coup d’œil ne suffit pas.", compareAction: "Comparer à une référence…", close: "Fermer", ctlSize: "taille", ctlSmaller: "réduire", ctlLarger: "agrandir", ctlShape: "forme", ctlCopiedValue: "Valeur copiée", ctlCopiedComparison: "Texte de comparaison copié", ctlCopiedImage: "Image copiée", ctlCopiedSvg: "SVG copié" },
  de: { view: "Visualisierung anzeigen", ariaView: "Visualisierung anzeigen, {type}", actions: "Aktionen", copyValue: "Wert kopieren", copyComparison: "Vergleichstext kopieren", copyImage: "Bild kopieren", copySvg: "SVG kopieren", copiedValue: "Wert kopiert · {n} {unit}", copiedComparison: "Vergleichstext kopiert · {n} Zellen", copiedImage: "Bild kopiert", copiedSvg: "SVG kopiert", copyFailed: "Kopieren fehlgeschlagen", desc: "Visualisierungskanäle — Typ {type}; Zellen {cells}; Farbleiste {bars}; Quartilzellen {quartiles}; Leerkarte {bmin} bis {bmax}; Leistenmarken {bleft} und {bright} von {bslots}.", stepCite: "Zitieren", stepVisualize: "Visualisieren", stepCompare: "Vergleichen", teachVisualize: "Dies ist die vollständige Visualisierung – lesen Sie die Zellen, um einen Wert zu prüfen; ein Blick genügt nicht.", compareAction: "Mit einer Referenz vergleichen…", close: "Schließen", ctlSize: "Größe", ctlSmaller: "verkleinern", ctlLarger: "vergrößern", ctlShape: "Form", ctlCopiedValue: "Wert kopiert", ctlCopiedComparison: "Vergleichstext kopiert", ctlCopiedImage: "Bild kopiert", ctlCopiedSvg: "SVG kopiert" },
  it: { view: "Mostra visualizzazione", ariaView: "mostra visualizzazione, {type}", actions: "Azioni", copyValue: "Copia valore", copyComparison: "Copia testo di confronto", copyImage: "Copia immagine", copySvg: "Copia SVG", copiedValue: "Valore copiato · {n} {unit}", copiedComparison: "Testo di confronto copiato · {n} celle", copiedImage: "Immagine copiata", copiedSvg: "SVG copiato", copyFailed: "Copia non riuscita", desc: "Canali della visualizzazione — tipo {type}; celle {cells}; barra dei colori {bars}; celle di quartile {quartiles}; mappa dei vuoti da {bmin} a {bmax}; marcatori barra {bleft} e {bright} di {bslots}.", stepCite: "Cita", stepVisualize: "Visualizza", stepCompare: "Confronta", teachVisualize: "Questa è la visualizzazione completa: leggi le celle per verificare un valore; un’occhiata non basta.", compareAction: "Confronta con un riferimento…", close: "Chiudi", ctlSize: "dimensione", ctlSmaller: "riduci", ctlLarger: "ingrandisci", ctlShape: "forma", ctlCopiedValue: "Valore copiato", ctlCopiedComparison: "Testo di confronto copiato", ctlCopiedImage: "Immagine copiata", ctlCopiedSvg: "SVG copiato" },
  pt: { view: "Ver visualização", ariaView: "ver visualização, {type}", actions: "Ações", copyValue: "Copiar valor", copyComparison: "Copiar texto de comparação", copyImage: "Copiar imagem", copySvg: "Copiar SVG", copiedValue: "Valor copiado · {n} {unit}", copiedComparison: "Texto de comparação copiado · {n} células", copiedImage: "Imagem copiada", copiedSvg: "SVG copiado", copyFailed: "Falha ao copiar", desc: "Canais da visualização — tipo {type}; células {cells}; barra de cores {bars}; células de quartil {quartiles}; mapa de vazios {bmin} a {bmax}; marcadores de barra {bleft} e {bright} de {bslots}.", stepCite: "Citar", stepVisualize: "Visualizar", stepCompare: "Comparar", teachVisualize: "Esta é a visualização completa — leia as células para conferir um valor; uma olhada não basta.", compareAction: "Comparar com uma referência…", close: "Fechar", ctlSize: "tamanho", ctlSmaller: "reduzir", ctlLarger: "ampliar", ctlShape: "forma", ctlCopiedValue: "Valor copiado", ctlCopiedComparison: "Texto de comparação copiado", ctlCopiedImage: "Imagem copiada", ctlCopiedSvg: "SVG copiado" },
  ru: { view: "Показать визуализацию", ariaView: "показать визуализацию, {type}", actions: "Действия", copyValue: "Копировать значение", copyComparison: "Копировать текст сравнения", copyImage: "Копировать изображение", copySvg: "Копировать SVG", copiedValue: "Значение скопировано · {n} {unit}", copiedComparison: "Текст сравнения скопирован · {n} ячеек", copiedImage: "Изображение скопировано", copiedSvg: "SVG скопирован", copyFailed: "Не удалось скопировать", desc: "Каналы визуализации — тип {type}; ячейки {cells}; цветовая полоса {bars}; ячейки квартилей {quartiles}; карта пустот от {bmin} до {bmax}; маркеры полосы {bleft} и {bright} из {bslots}.", stepCite: "Цитата", stepVisualize: "Визуализация", stepCompare: "Сравнение", teachVisualize: "Это полная визуализация — читайте ячейки, чтобы проверить значение; беглого взгляда недостаточно.", compareAction: "Сравнить с образцом…", close: "Закрыть", ctlSize: "размер", ctlSmaller: "уменьшить", ctlLarger: "увеличить", ctlShape: "форма", ctlCopiedValue: "Значение скопировано", ctlCopiedComparison: "Текст сравнения скопирован", ctlCopiedImage: "Изображение скопировано", ctlCopiedSvg: "SVG скопирован" },
  el: { view: "Προβολή οπτικοποίησης", ariaView: "προβολή οπτικοποίησης, {type}", actions: "Ενέργειες", copyValue: "Αντιγραφή τιμής", copyComparison: "Αντιγραφή κειμένου σύγκρισης", copyImage: "Αντιγραφή εικόνας", copySvg: "Αντιγραφή SVG", copiedValue: "Η τιμή αντιγράφηκε · {n} {unit}", copiedComparison: "Το κείμενο σύγκρισης αντιγράφηκε · {n} κελιά", copiedImage: "Η εικόνα αντιγράφηκε", copiedSvg: "Το SVG αντιγράφηκε", copyFailed: "Η αντιγραφή απέτυχε", desc: "Κανάλια οπτικοποίησης — τύπος {type}· κελιά {cells}· μπάρα χρώματος {bars}· κελιά τεταρτημορίων {quartiles}· χάρτης κενών {bmin} έως {bmax}· δείκτες μπάρας {bleft} και {bright} από {bslots}.", stepCite: "Παράθεση", stepVisualize: "Οπτικοποίηση", stepCompare: "Σύγκριση", teachVisualize: "Αυτή είναι η πλήρης οπτικοποίηση — διαβάστε τα κελιά για να ελέγξετε μια τιμή· μια ματιά δεν αρκεί.", compareAction: "Σύγκριση με αναφορά…", close: "Κλείσιμο", ctlSize: "μέγεθος", ctlSmaller: "σμίκρυνση", ctlLarger: "μεγέθυνση", ctlShape: "σχήμα", ctlCopiedValue: "Η τιμή αντιγράφηκε", ctlCopiedComparison: "Το κείμενο σύγκρισης αντιγράφηκε", ctlCopiedImage: "Η εικόνα αντιγράφηκε", ctlCopiedSvg: "Το SVG αντιγράφηκε" },
  "zh-Hans": { view: "查看可视化", ariaView: "查看可视化，{type}", actions: "操作", copyValue: "复制值", copyComparison: "复制比较文本", copyImage: "复制图片", copySvg: "复制 SVG", copiedValue: "已复制值 · {n} {unit}", copiedComparison: "已复制比较文本 · {n} 个单元格", copiedImage: "已复制图片", copiedSvg: "已复制 SVG", copyFailed: "复制失败", desc: "可视化通道 — 类型 {type}；单元格 {cells}；颜色条 {bars}；四分位单元格 {quartiles}；空白图 {bmin} 至 {bmax}；色条标记 {bleft} 和 {bright}，共 {bslots}。", stepCite: "引用", stepVisualize: "可视化", stepCompare: "比较", teachVisualize: "这是完整的可视化图 — 请逐格阅读以核对数值；仅凭一瞥并不可靠。", compareAction: "与参照进行比较…", close: "关闭", ctlSize: "大小", ctlSmaller: "缩小", ctlLarger: "放大", ctlShape: "形状", ctlCopiedValue: "已复制值", ctlCopiedComparison: "已复制比较文本", ctlCopiedImage: "已复制图片", ctlCopiedSvg: "已复制 SVG" },
  "zh-Hant": { view: "檢視視覺化", ariaView: "檢視視覺化，{type}", actions: "動作", copyValue: "複製值", copyComparison: "複製比較文字", copyImage: "複製圖片", copySvg: "複製 SVG", copiedValue: "已複製值 · {n} {unit}", copiedComparison: "已複製比較文字 · {n} 個儲存格", copiedImage: "已複製圖片", copiedSvg: "已複製 SVG", copyFailed: "複製失敗", desc: "視覺化通道 — 類型 {type}；儲存格 {cells}；色帶 {bars}；四分位儲存格 {quartiles}；空白圖 {bmin} 至 {bmax}；色帶標記 {bleft} 和 {bright}，共 {bslots}。", stepCite: "引用", stepVisualize: "視覺化", stepCompare: "比較", teachVisualize: "這是完整的視覺化圖 — 請逐格閱讀以核對數值；僅憑一瞥並不可靠。", compareAction: "與參照進行比較…", close: "關閉", ctlSize: "大小", ctlSmaller: "縮小", ctlLarger: "放大", ctlShape: "形狀", ctlCopiedValue: "已複製值", ctlCopiedComparison: "已複製比較文字", ctlCopiedImage: "已複製圖片", ctlCopiedSvg: "已複製 SVG" },
  ja: { view: "可視化を表示", ariaView: "可視化を表示、{type}", actions: "操作", copyValue: "値をコピー", copyComparison: "比較テキストをコピー", copyImage: "画像をコピー", copySvg: "SVG をコピー", copiedValue: "値をコピーしました · {n} {unit}", copiedComparison: "比較テキストをコピーしました · {n} セル", copiedImage: "画像をコピーしました", copiedSvg: "SVG をコピーしました", copyFailed: "コピーに失敗しました", desc: "可視化チャンネル — 種類 {type}、セル {cells}、カラーバー {bars}、四分位セル {quartiles}、空白マップ {bmin} から {bmax}、バーマーカー {bleft} と {bright}（全 {bslots}）。", stepCite: "引用", stepVisualize: "可視化", stepCompare: "比較", teachVisualize: "これは完全な可視化です。セルを読んで値を確認してください。ひと目では確認できません。", compareAction: "参照と比較…", close: "閉じる", ctlSize: "サイズ", ctlSmaller: "小さく", ctlLarger: "大きく", ctlShape: "形状", ctlCopiedValue: "値をコピーしました", ctlCopiedComparison: "比較テキストをコピーしました", ctlCopiedImage: "画像をコピーしました", ctlCopiedSvg: "SVG をコピーしました" },
  ko: { view: "시각화 보기", ariaView: "시각화 보기, {type}", actions: "작업", copyValue: "값 복사", copyComparison: "비교 텍스트 복사", copyImage: "이미지 복사", copySvg: "SVG 복사", copiedValue: "값 복사됨 · {n} {unit}", copiedComparison: "비교 텍스트 복사됨 · {n}개 셀", copiedImage: "이미지 복사됨", copiedSvg: "SVG 복사됨", copyFailed: "복사 실패", desc: "시각화 채널 — 유형 {type}; 셀 {cells}; 색상 막대 {bars}; 사분위 셀 {quartiles}; 빈칸 맵 {bmin}에서 {bmax}; 막대 표식 {bleft} 및 {bright} / {bslots}.", stepCite: "인용", stepVisualize: "시각화", stepCompare: "비교", teachVisualize: "전체 시각화입니다 — 값을 확인하려면 셀을 읽으세요. 한눈에는 알 수 없습니다.", compareAction: "참조와 비교…", close: "닫기", ctlSize: "크기", ctlSmaller: "축소", ctlLarger: "확대", ctlShape: "모양", ctlCopiedValue: "값 복사됨", ctlCopiedComparison: "비교 텍스트 복사됨", ctlCopiedImage: "이미지 복사됨", ctlCopiedSvg: "SVG 복사됨" },
  hi: { view: "विज़ुअलाइज़ेशन देखें", ariaView: "विज़ुअलाइज़ेशन देखें, {type}", actions: "क्रियाएँ", copyValue: "मान कॉपी करें", copyComparison: "तुलना पाठ कॉपी करें", copyImage: "छवि कॉपी करें", copySvg: "SVG कॉपी करें", copiedValue: "मान कॉपी किया गया · {n} {unit}", copiedComparison: "तुलना पाठ कॉपी किया गया · {n} सेल", copiedImage: "छवि कॉपी की गई", copiedSvg: "SVG कॉपी किया गया", copyFailed: "कॉपी विफल", desc: "विज़ुअलाइज़ेशन चैनल — प्रकार {type}; सेल {cells}; रंग पट्टी {bars}; चतुर्थक सेल {quartiles}; रिक्त मानचित्र {bmin} से {bmax}; पट्टी चिह्न {bleft} और {bright}, कुल {bslots}।", stepCite: "उद्धरण", stepVisualize: "विज़ुअलाइज़", stepCompare: "तुलना", teachVisualize: "यह पूर्ण विज़ुअलाइज़ेशन है — मान जाँचने के लिए सेल पढ़ें; एक नज़र पर्याप्त नहीं है।", compareAction: "किसी संदर्भ से तुलना करें…", close: "बंद करें", ctlSize: "आकार", ctlSmaller: "छोटा करें", ctlLarger: "बड़ा करें", ctlShape: "आकृति", ctlCopiedValue: "मान कॉपी किया गया", ctlCopiedComparison: "तुलना पाठ कॉपी किया गया", ctlCopiedImage: "छवि कॉपी की गई", ctlCopiedSvg: "SVG कॉपी किया गया" },
  id: { view: "Lihat visualisasi", ariaView: "lihat visualisasi, {type}", actions: "Tindakan", copyValue: "Salin nilai", copyComparison: "Salin teks perbandingan", copyImage: "Salin gambar", copySvg: "Salin SVG", copiedValue: "Nilai disalin · {n} {unit}", copiedComparison: "Teks perbandingan disalin · {n} sel", copiedImage: "Gambar disalin", copiedSvg: "SVG disalin", copyFailed: "Gagal menyalin", desc: "Saluran visualisasi — tipe {type}; sel {cells}; bilah warna {bars}; sel kuartil {quartiles}; peta kosong {bmin} hingga {bmax}; penanda bilah {bleft} dan {bright} dari {bslots}.", stepCite: "Kutip", stepVisualize: "Visualisasikan", stepCompare: "Bandingkan", teachVisualize: "Ini visualisasi lengkapnya — baca selnya untuk memeriksa nilai; sekilas pandang tak cukup.", compareAction: "Bandingkan dengan referensi…", close: "Tutup", ctlSize: "ukuran", ctlSmaller: "perkecil", ctlLarger: "perbesar", ctlShape: "bentuk", ctlCopiedValue: "Nilai disalin", ctlCopiedComparison: "Teks perbandingan disalin", ctlCopiedImage: "Gambar disalin", ctlCopiedSvg: "SVG disalin" },
  tr: { view: "Görselleştirmeyi gör", ariaView: "görselleştirmeyi gör, {type}", actions: "Eylemler", copyValue: "Değeri kopyala", copyComparison: "Karşılaştırma metnini kopyala", copyImage: "Görseli kopyala", copySvg: "SVG kopyala", copiedValue: "Değer kopyalandı · {n} {unit}", copiedComparison: "Karşılaştırma metni kopyalandı · {n} hücre", copiedImage: "Görsel kopyalandı", copiedSvg: "SVG kopyalandı", copyFailed: "Kopyalama başarısız", desc: "Görselleştirme kanalları — tür {type}; hücreler {cells}; renk çubuğu {bars}; çeyrek hücreleri {quartiles}; boşluk haritası {bmin} – {bmax}; çubuk işaretleri {bleft} ve {bright} / {bslots}.", stepCite: "Alıntıla", stepVisualize: "Görselleştir", stepCompare: "Karşılaştır", teachVisualize: "Bu, tam görselleştirmedir — bir değeri kontrol etmek için hücreleri okuyun; bir bakış yetmez.", compareAction: "Bir referansla karşılaştır…", close: "Kapat", ctlSize: "boyut", ctlSmaller: "küçült", ctlLarger: "büyüt", ctlShape: "şekil", ctlCopiedValue: "Değer kopyalandı", ctlCopiedComparison: "Karşılaştırma metni kopyalandı", ctlCopiedImage: "Görsel kopyalandı", ctlCopiedSvg: "SVG kopyalandı" },
  vi: { view: "Xem trực quan hóa", ariaView: "xem trực quan hóa, {type}", actions: "Tác vụ", copyValue: "Sao chép giá trị", copyComparison: "Sao chép văn bản so sánh", copyImage: "Sao chép hình ảnh", copySvg: "Sao chép SVG", copiedValue: "Đã sao chép giá trị · {n} {unit}", copiedComparison: "Đã sao chép văn bản so sánh · {n} ô", copiedImage: "Đã sao chép hình ảnh", copiedSvg: "Đã sao chép SVG", copyFailed: "Sao chép thất bại", desc: "Các kênh trực quan hóa — loại {type}; ô {cells}; thanh màu {bars}; ô tứ phân vị {quartiles}; bản đồ trống {bmin} đến {bmax}; điểm đánh dấu thanh {bleft} và {bright} trên {bslots}.", stepCite: "Trích dẫn", stepVisualize: "Trực quan hóa", stepCompare: "So sánh", teachVisualize: "Đây là hình ảnh trực quan đầy đủ — hãy đọc các ô để kiểm tra giá trị; liếc qua là không đủ.", compareAction: "So sánh với một tham chiếu…", close: "Đóng", ctlSize: "kích thước", ctlSmaller: "thu nhỏ", ctlLarger: "phóng to", ctlShape: "hình dạng", ctlCopiedValue: "Đã sao chép giá trị", ctlCopiedComparison: "Đã sao chép văn bản so sánh", ctlCopiedImage: "Đã sao chép hình ảnh", ctlCopiedSvg: "Đã sao chép SVG" },
  ar: { view: "عرض التمثيل المرئي", ariaView: "عرض التمثيل المرئي، {type}", actions: "إجراءات", copyValue: "نسخ القيمة", copyComparison: "نسخ نص المقارنة", copyImage: "نسخ الصورة", copySvg: "نسخ SVG", copiedValue: "تم نسخ القيمة · {n} {unit}", copiedComparison: "تم نسخ نص المقارنة · {n} خلية", copiedImage: "تم نسخ الصورة", copiedSvg: "تم نسخ SVG", copyFailed: "فشل النسخ", desc: "قنوات التمثيل المرئي — النوع {type}؛ الخلايا {cells}؛ شريط الألوان {bars}؛ خلايا الربيع {quartiles}؛ خريطة الفراغات من {bmin} إلى {bmax}؛ علامات الشريط {bleft} و{bright} من {bslots}.", stepCite: "اقتباس", stepVisualize: "تمثيل مرئي", stepCompare: "مقارنة", teachVisualize: "هذا هو التمثيل المرئي الكامل — اقرأ الخلايا للتحقق من قيمة؛ نظرة سريعة لا تكفي.", compareAction: "قارن بمرجع…", close: "إغلاق", ctlSize: "الحجم", ctlSmaller: "تصغير", ctlLarger: "تكبير", ctlShape: "الشكل", ctlCopiedValue: "تم نسخ القيمة", ctlCopiedComparison: "تم نسخ نص المقارنة", ctlCopiedImage: "تم نسخ الصورة", ctlCopiedSvg: "تم نسخ SVG" },
  he: { view: "הצג המחשה", ariaView: "הצג המחשה, {type}", actions: "פעולות", copyValue: "העתק ערך", copyComparison: "העתק טקסט השוואה", copyImage: "העתק תמונה", copySvg: "העתק SVG", copiedValue: "הערך הועתק · {n} {unit}", copiedComparison: "טקסט ההשוואה הועתק · {n} תאים", copiedImage: "התמונה הועתקה", copiedSvg: "‏SVG הועתק", copyFailed: "ההעתקה נכשלה", desc: "ערוצי ההמחשה — סוג {type}; תאים {cells}; פס צבע {bars}; תאי רבעון {quartiles}; מפת ריקים מ-{bmin} עד {bmax}; סימוני פס {bleft} ו-{bright} מתוך {bslots}.", stepCite: "ציטוט", stepVisualize: "המחשה", stepCompare: "השוואה", teachVisualize: "זוהי ההמחשה המלאה — קראו את התאים כדי לבדוק ערך; מבט חטוף אינו מספיק.", compareAction: "השוואה מול מקור ייחוס…", close: "סגירה", ctlSize: "גודל", ctlSmaller: "הקטן", ctlLarger: "הגדל", ctlShape: "צורה", ctlCopiedValue: "הערך הועתק", ctlCopiedComparison: "טקסט ההשוואה הועתק", ctlCopiedImage: "התמונה הועתקה", ctlCopiedSvg: "SVG הועתק" },
};

const RTL = new Set(["ar", "he", "fa", "ur"]);

/** True if the (primary subtag of the) locale is an RTL script. */
export function isRtlLocale(locale: string): boolean {
  return RTL.has(locale.toLowerCase().split("-")[0]);
}

// Map a BCP-47 tag to a catalog key: exact match, then Chinese script/region
// resolution (zh-TW/HK/MO/Hant → Traditional, else Simplified), then primary
// subtag.
function pickKey(tag: string): string | null {
  const t = tag.toLowerCase();
  for (const k of Object.keys(CATALOG)) if (k.toLowerCase() === t) return k;
  if (t.startsWith("zh")) return /hant|\b(tw|hk|mo)\b|-(tw|hk|mo)/.test(t) ? "zh-Hant" : "zh-Hans";
  const primary = t.split("-")[0];
  for (const k of Object.keys(CATALOG)) if (k.toLowerCase() === primary) return k;
  return null;
}

/**
 * Resolve a Messages bundle for a locale tag, falling back to English. Pass
 * `undefined` to auto-detect from the browser (navigator.languages).
 */
export function resolveMessages(locale?: string): { locale: string; messages: Messages } {
  const tags = locale
    ? [locale]
    : typeof navigator !== "undefined"
      ? [...(navigator.languages ?? [navigator.language])]
      : ["en"];
  for (const tag of tags) {
    const key = pickKey(tag);
    if (key) return { locale: key, messages: CATALOG[key] };
  }
  return { locale: "en", messages: en };
}

export const SUPPORTED_LOCALES = Object.keys(CATALOG);

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

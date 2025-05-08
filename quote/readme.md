**Objective:**  
Generate a **modern, responsive finance calculator web application** that allows users to **upload an Excel file**, **view the full table**, **select rows**, and **group them into bundles** with a **total cost calculation**. The app should include a **loading spinner** while processing the file and feature a **sleek, professional UI inspired by Atturra's website**.

---

### **🔹 Requirements**
#### **1️⃣ HTML Structure**
- Create a **clean, semantic HTML layout**.
- Include:
  - A **file upload input** (`.xlsx, .xls` support).
  - A **loading spinner** that appears while processing the file.
  - A **table** that dynamically populates from the uploaded Excel file.
  - A **button to create bundles** from selected rows.
  - A **section to display created bundles**.

#### **2️⃣ CSS Styling**
- Use **modern UI principles** inspired by **Atturra's website**:
  - **Professional color scheme** (`#0056b3`, `#003d82`, `#f8f9fa`).
  - **Gradient buttons** with hover effects.
  - **Smooth animations** for table loading (`opacity transition`).
  - **Flexbox & Grid** for responsiveness.
- Implement:
  - **Loading spinner animation** (`@keyframes spin`).
  - **Row selection highlighting** (`.selected` class).
  - **Mobile-friendly design** (`@media queries`).

#### **3️⃣ JavaScript Functionality**
- **Handle Excel file upload** using `XLSX.js`.
- **Parse Excel data** into a structured table (`sheet_to_json`).
- **Show a loading spinner** while processing the file.
- **Allow row selection** by clicking (`toggleSelection()`).
- **Create bundles** from selected rows (`createBundle()`).
- **Calculate total cost** dynamically (`parseFloat()`).
- **Ensure smooth UI transitions** (`setTimeout()` for loading effect).

---

### **🔹 Expected Output**
#### **1️⃣ HTML (`index.html`)**
- Semantic structure with **file upload, table, spinner, and bundle section**.

#### **2️⃣ CSS (`styles.css`)**
- **Modern, responsive styling** with **animations, gradients, and hover effects**.

#### **3️⃣ JavaScript (`script.js`)**
- **Efficient event handling**, **Excel parsing**, **row selection**, and **bundle creation**.

---

### **🔹 Additional Considerations**
✅ **Performance Optimization:** Ensure smooth rendering for large Excel files.  
✅ **Accessibility:** Use **ARIA attributes** for better usability.  
✅ **Error Handling:** Prevent crashes from invalid file uploads.  
✅ **Scalability:** Allow future enhancements like **CSV support** or **database integration**.  

---

### **🔹 Final Instructions**
Generate **fully functional HTML, CSS, and JavaScript files** that meet the above requirements. Ensure **clean, well-commented code** for easy customization. Provide **step-by-step explanations** for each section.


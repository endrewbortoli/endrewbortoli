const checkoutBtn = document.getElementById("checkoutBtn");
const lightbox = document.getElementById("lightbox");

checkoutBtn.addEventListener("click", () => {
  lightbox.classList.remove("hidden");
});

lightbox.addEventListener("click", (e) => {
  if (e.target.id === "lightbox") {
    lightbox.classList.add("hidden");
  }
});

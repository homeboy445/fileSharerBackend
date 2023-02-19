const dialogBox = document.querySelector(".dialog-box");
let dialogBoxOpen = true;

function toggleDialogBox() {
  if (!dialogBoxOpen) {
    dialogBox.style.visibility = "visible";
    dialogBox.style.pointerEvents = "all";
  } else {
    dialogBox.style.visibility = "hidden";
    dialogBox.style.pointerEvents = "none";
  }
  dialogBoxOpen = !dialogBoxOpen;
}

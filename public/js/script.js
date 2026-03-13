document.addEventListener('DOMContentLoaded', function () {
  const allButtons = document.querySelectorAll('.searchBtn');
  const searchBar = document.querySelector('.searchBar');
  const searchInput = document.getElementById('searchInput');
  const searchClose = document.getElementById('searchClose');

  allButtons.forEach((btn) => {
    btn.addEventListener('click', function () {
      if (!searchBar) return;
      searchBar.style.visibility = 'visible';
      searchBar.classList.add('open');
      this.setAttribute('aria-expanded', 'true');
      if (searchInput) searchInput.focus();
    });
  });

  if (searchClose) {
    searchClose.addEventListener('click', function () {
      if (!searchBar) return;
      searchBar.style.visibility = 'hidden';
      searchBar.classList.remove('open');
      this.setAttribute('aria-expanded', 'false');
    });
  }

  // Toggle password visibility for any .input-wrapper button pair.
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', function () {
      const wrapper = this.closest('.input-wrapper');
      const input = wrapper ? wrapper.querySelector('input') : null;
      if (!input) return;

      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      this.innerHTML = hidden ? '&#128584;' : '&#128065;';
      this.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    });
  });

  if (document.querySelector('.page-container')) {
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.classList.add('centered');
  }

  const welcome = document.getElementById('welcome-msg');
  if (welcome) {
    welcome.classList.add('show');
    setTimeout(() => {
      welcome.classList.remove('show');
      setTimeout(() => welcome.remove(), 400);
    }, 2200);
  }

  const avatarBtn = document.getElementById('profileAvatarBtn');
  const imageMenu = document.getElementById('profileImageMenu');
  const changeImageBtn = document.getElementById('changeProfileImageBtn');
  const viewImageBtn = document.getElementById('viewProfileImageBtn');
  const imageInput = document.getElementById('profileImageInput');
  const imageForm = document.getElementById('profileImageForm');
  const imageModal = document.getElementById('profileImageModal');
  const closeImageModal = document.getElementById('closeProfileImageModal');

  if (avatarBtn && imageMenu) {
    avatarBtn.addEventListener('click', function () {
      imageMenu.classList.toggle('hidden');
    });
  }

  if (changeImageBtn && imageInput) {
    changeImageBtn.addEventListener('click', function () {
      imageMenu.classList.add('hidden');
      imageInput.click();
    });
  }

  if (imageInput && imageForm) {
    imageInput.addEventListener('change', function () {
      if (this.files && this.files.length > 0) {
        imageForm.submit();
      }
    });
  }

  if (viewImageBtn && imageModal) {
    viewImageBtn.addEventListener('click', function () {
      imageMenu.classList.add('hidden');
      imageModal.classList.remove('hidden');
    });
  }

  if (closeImageModal && imageModal) {
    closeImageModal.addEventListener('click', function () {
      imageModal.classList.add('hidden');
    });
  }

  document.querySelectorAll('.js-share-post').forEach((btn) => {
    btn.addEventListener('click', async function () {
      const sharePath = this.getAttribute('data-share-url');
      const shareUrl = `${window.location.origin}${sharePath}`;

      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, url: shareUrl });
          return;
        }
      } catch (err) {
        // ignore share cancellation and fall through to clipboard
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        const originalText = this.textContent;
        this.textContent = 'Link Copied';
        setTimeout(() => {
          this.textContent = originalText;
        }, 1500);
      } catch (err) {
        alert(shareUrl);
      }
    });
  });
});

function earthDataEpic() {
  var wrap = document.getElementById('epic-gallery');
  if (!wrap) return;

  var fullUrls = [];
  var currentIndex = -1;

  // Build lightbox
  var lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  var lbImg = document.createElement('img');
  var lbPrev = document.createElement('button');
  lbPrev.className = 'lightbox-prev';
  lbPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
  var lbNext = document.createElement('button');
  lbNext.className = 'lightbox-next';
  lbNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
  lightbox.appendChild(lbPrev);
  lightbox.appendChild(lbImg);
  lightbox.appendChild(lbNext);
  document.body.appendChild(lightbox);

  function openLightbox(i) {
    currentIndex = i;
    lbImg.src = fullUrls[i];
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function animateImg(cls) {
    lbImg.classList.remove('slide-next', 'slide-prev');
    void lbImg.offsetWidth;
    lbImg.classList.add(cls);
  }

  function showNext() {
    if (currentIndex < fullUrls.length - 1) {
      animateImg('slide-next');
      openLightbox(currentIndex + 1);
    }
  }

  function showPrev() {
    if (currentIndex > 0) {
      animateImg('slide-prev');
      openLightbox(currentIndex - 1);
    }
  }

  lightbox.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', function (e) { e.stopPropagation(); showPrev(); });
  lbNext.addEventListener('click', function (e) { e.stopPropagation(); showNext(); });

  document.addEventListener('keydown', function (e) {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showNext();
    if (e.key === 'ArrowLeft') showPrev();
  });

  var touchStartX = 0;
  lightbox.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', function (e) {
    var delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) < 40) { e.preventDefault(); closeLightbox(); return; }
    if (delta < 0) showNext(); else showPrev();
  });

  // Fetch images
  fetch('https://epic.gsfc.nasa.gov/api/natural', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      var items = data;
      if (!items.length) {
        wrap.innerHTML = '<span class="c-muted" style="font-size:0.65rem">No images available</span>';
        return;
      }

      var updatedEl = document.getElementById('epic-updated');
      if (updatedEl && items[0]) {
        var d = new Date(items[0].date.replace(' ', 'T') + 'Z');
        if (!isNaN(d.getTime())) {
          var localDate = d.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
          var localTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          updatedEl.textContent = 'Last updated ' + localDate + ' ' + localTime;
        }
      }

      items.reverse();
      var html = '';
      items.forEach(function (item, i) {
        var parts = item.date.split(' ')[0].split('-');
        var yyyy = parts[0];
        var mm = parts[1];
        var dd = parts[2];
        var base = 'https://epic.gsfc.nasa.gov/archive/natural/' + yyyy + '/' + mm + '/' + dd;
        var thumb = base + '/thumbs/' + item.image + '.jpg';
        var full = base + '/jpg/' + item.image + '.jpg';
        fullUrls.push(full);
        var time = item.date.split(' ')[1] || '';
        if (time) time = time.slice(0, 5) + ' UTC';
        html += '<div class="epic-item" data-index="' + i + '">' +
          '<img src="' + thumb + '" alt="Earth ' + item.date + '" loading="lazy">' +
          '<span class="epic-time">' + time + '</span>' +
          '</div>';
      });

      wrap.innerHTML = html;
      wrap.style.opacity = '1';

      wrap.querySelectorAll('.epic-item img').forEach(function (img) {
        if (img.complete && img.naturalWidth > 0) {
          img.classList.add('loaded');
        } else {
          img.addEventListener('load', function () { img.classList.add('loaded'); });
        }
      });

      wrap.querySelectorAll('.epic-item').forEach(function (el) {
        el.addEventListener('click', function () {
          openLightbox(parseInt(el.getAttribute('data-index'), 10));
        });
      });

    })
    .catch(function () {
      wrap.innerHTML = '<span class="c-muted" style="font-size:0.65rem">Unable to load images</span>';
    });
}

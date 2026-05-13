// js/mandatory-survey.js
// 30 dakika sitede kalan kullanıcıya zorunlu anket gösterir.
// Tüm sayfalarda yüklü olmalı.

(function () {
  const MANDATORY_THRESHOLD_MS = 30 * 60 * 1000; // 30 dakika
  const CHECK_INTERVAL_MS = 60 * 1000;           // her dakika kontrol et
  const STORAGE_KEY = 'gu_session_start';
  const SHOWN_KEY = 'gu_mandatory_shown';

  // Bu sayfa zaten zorunlu anket modal'ını gösteriyorsa atla
  if (window.__GU_MANDATORY_INIT) return;
  window.__GU_MANDATORY_INIT = true;

  // Oturum başlangıç zamanı (sekmeler arası paylaşılır)
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }

  // Her 1 dakikada bir kontrol et
  let checkInterval = null;
  let modalOpen = false;

  function shouldCheck() {
    const start = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
    return Date.now() - start >= MANDATORY_THRESHOLD_MS;
  }

  async function checkMandatory() {
    if (modalOpen) return;
    if (!shouldCheck()) return;

    try {
      const res = await fetch('/api/surveys/mandatory/check', { credentials: 'include' });
      if (!res.ok) return; // giriş yapılmamış olabilir
      const data = await res.json();
      if (data.mandatory && !sessionStorage.getItem(SHOWN_KEY + '_' + data.mandatory.id)) {
        showMandatoryModal(data.mandatory);
      }
    } catch (err) { /* sessizce geç */ }
  }

  function showMandatoryModal(survey) {
    modalOpen = true;
    sessionStorage.setItem(SHOWN_KEY + '_' + survey.id, '1');

    const overlay = document.createElement('div');
    overlay.id = 'mandatory-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center; padding: 16px;
      animation: gu-fade-in 0.3s ease;
    `;

    const rewardText = survey.reward_type === 'balance' && survey.reward_amount > 0
      ? `<span class="gu-reward-badge">+${parseFloat(survey.reward_amount).toFixed(0)} ₺</span>`
      : '';

    overlay.innerHTML = `
      <style>
        @keyframes gu-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gu-slide-up { from { transform: translateY(20px) scale(0.95); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        #mandatory-card { font-family: 'Plus Jakarta Sans', sans-serif; background: white; border-radius: 28px; width: 100%; max-width: 480px; padding: 32px 28px; box-shadow: 0 25px 50px rgba(0,0,0,.25); animation: gu-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        #mandatory-card h1 { color: #0f172a; font-size: 22px; font-weight: 800; margin: 16px 0 8px; line-height: 1.3; }
        #mandatory-card p.sub { color: #64748b; font-size: 14px; font-weight: 500; line-height: 1.6; margin-bottom: 20px; }
        .gu-icon-box { width: 64px; height: 64px; border-radius: 18px; background: linear-gradient(135deg, #2563eb, #4f46e5); display:flex; align-items:center; justify-content:center; color:white; font-size:26px; box-shadow: 0 10px 25px rgba(37,99,235,.3); }
        .gu-reward-badge { display: inline-block; background: linear-gradient(135deg, #f59e0b, #fb923c); color: white; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; margin-bottom: 14px; box-shadow: 0 4px 10px rgba(245,158,11,.3); }
        .gu-info { background: #fef3c7; border: 1px solid #fde68a; border-radius: 14px; padding: 14px; display: flex; gap: 12px; align-items: flex-start; margin-bottom: 22px; }
        .gu-info i { color: #d97706; font-size: 14px; margin-top: 2px; }
        .gu-info p { color: #92400e; font-size: 12px; font-weight: 600; margin: 0; line-height: 1.5; }
        .gu-btn { width: 100%; background: #2563eb; color: white; font-weight: 700; font-size: 14px; padding: 14px; border-radius: 14px; border: none; cursor: pointer; transition: all .2s; box-shadow: 0 4px 14px rgba(37,99,235,.3); }
        .gu-btn:hover { background: #1d4ed8; transform: translateY(-1px); }
        .gu-btn:disabled { opacity: .6; cursor: not-allowed; }
        .gu-meta { display: flex; gap: 14px; margin-bottom: 18px; font-size: 12px; color: #64748b; font-weight: 600; }
        .gu-meta span { display: inline-flex; align-items: center; gap: 5px; }
        #mandatory-questions { max-height: 50vh; overflow-y: auto; margin-bottom: 18px; padding-right: 4px; }
        #mandatory-questions::-webkit-scrollbar { width: 6px; }
        #mandatory-questions::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .gu-q { margin-bottom: 20px; }
        .gu-q-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 10px; line-height: 1.4; }
        .gu-q-required { color: #ef4444; }
        .gu-opt { display: flex; align-items: center; padding: 11px 14px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; cursor: pointer; transition: all .15s; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #334155; }
        .gu-opt:hover { background: white; border-color: #cbd5e1; }
        .gu-opt input { margin-right: 10px; accent-color: #2563eb; }
        .gu-opt.selected { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; }
        .gu-text { width: 100%; padding: 12px; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 13px; font-weight: 500; resize: none; }
        .gu-text:focus { outline: none; border-color: #2563eb; background: white; }
        .gu-stars { display: flex; gap: 6px; }
        .gu-star { cursor: pointer; font-size: 26px; color: #e2e8f0; transition: all .15s; }
        .gu-star.on { color: #fbbf24; transform: scale(1.1); }
        #mandatory-step1, #mandatory-step2, #mandatory-success { display: none; }
        #mandatory-step1.active, #mandatory-step2.active, #mandatory-success.active { display: block; }
      </style>

      <div id="mandatory-card" role="dialog" aria-modal="true">
        <!-- ADIM 1: TANITIM -->
        <div id="mandatory-step1" class="active">
          <div class="gu-icon-box"><i class="fa-solid fa-clipboard-question"></i></div>
          ${rewardText}
          <h1>Hızlı bir ankete katılmanı istiyoruz</h1>
          <p class="sub">Bu kısa ankete katılarak sitede kalmaya devam edebilirsin. Cevapların hizmet kalitemizi geliştirmemize yardımcı olur.</p>

          <div class="gu-meta">
            <span><i class="fa-regular fa-clock"></i> ~${survey.estimated_minutes || 2} dakika</span>
            <span><i class="fa-solid fa-shield-halved"></i> Zorunlu Anket</span>
          </div>

          <div class="gu-info">
            <i class="fa-solid fa-circle-info"></i>
            <p>Bu anketi tamamlamadan sitedeki diğer işlemlere devam edemezsin. Anket tamamlandığında ödülün hesabına geçer.</p>
          </div>

          <button class="gu-btn" id="mandatory-start-btn">
            Ankete Başla <i class="fa-solid fa-arrow-right" style="margin-left:6px"></i>
          </button>
        </div>

        <!-- ADIM 2: SORULAR -->
        <div id="mandatory-step2">
          <h1 style="margin-top:0">${escapeHtml(survey.title)}</h1>
          <p class="sub">${escapeHtml(survey.subtitle || 'Lütfen tüm zorunlu soruları yanıtla.')}</p>
          <div id="mandatory-questions"><div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">Sorular yükleniyor...</div></div>
          <button class="gu-btn" id="mandatory-submit-btn" disabled>Anketi Gönder</button>
        </div>

        <!-- ADIM 3: BAŞARILI -->
        <div id="mandatory-success">
          <div class="gu-icon-box" style="background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 10px 25px rgba(16,185,129,.3)"><i class="fa-solid fa-check"></i></div>
          <h1 id="mandatory-success-title">Teşekkürler!</h1>
          <p class="sub" id="mandatory-success-text">Anketi tamamladın. Sitedeki işlemlerine kaldığın yerden devam edebilirsin.</p>
          <button class="gu-btn" onclick="document.getElementById('mandatory-overlay').remove(); window.modalOpen=false;">
            Devam Et
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.getElementById('mandatory-start-btn').onclick = () => startSurvey(survey.id);
  }

  async function startSurvey(surveyId) {
    document.getElementById('mandatory-step1').classList.remove('active');
    document.getElementById('mandatory-step2').classList.add('active');

    try {
      const res = await fetch('/api/surveys/' + surveyId, { credentials: 'include' });
      const data = await res.json();
      renderQuestions(data.questions || [], surveyId);
    } catch (err) {
      document.getElementById('mandatory-questions').innerHTML =
        '<p style="color:#ef4444;text-align:center;padding:20px">Yüklenemedi: ' + (err.message || '') + '</p>';
    }
  }

  function renderQuestions(questions, surveyId) {
    const cont = document.getElementById('mandatory-questions');
    const answers = {}; // question_id -> answer obj

    cont.innerHTML = questions.map((q, idx) => {
      let body = '';
      if (q.question_type === 'single_choice' || q.question_type === 'multi_choice') {
        body = q.options.map(opt => `
          <label class="gu-opt" data-qid="${q.id}" data-oid="${opt.id}">
            <input type="${q.question_type === 'single_choice' ? 'radio' : 'checkbox'}"
                   name="q-${q.id}" value="${opt.id}" />
            ${escapeHtml(opt.option_text)}
          </label>
        `).join('');
      } else if (q.question_type === 'rating') {
        body = `<div class="gu-stars" data-qid="${q.id}">
          ${[1,2,3,4,5].map(n => `<i class="fa-solid fa-star gu-star" data-val="${n}"></i>`).join('')}
        </div>`;
      } else { // text
        body = `<textarea class="gu-text" rows="3" data-qid="${q.id}" placeholder="Yanıtınız..."></textarea>`;
      }

      return `
        <div class="gu-q">
          <p class="gu-q-title">${idx + 1}. ${escapeHtml(q.question_text)} ${q.is_required ? '<span class="gu-q-required">*</span>' : ''}</p>
          ${body}
        </div>
      `;
    }).join('');

    // Event bindings
    cont.querySelectorAll('.gu-opt input').forEach(input => {
      input.addEventListener('change', (e) => {
        const label = e.target.closest('.gu-opt');
        const qid = label.dataset.qid;
        const oid = parseInt(label.dataset.oid);

        if (e.target.type === 'radio') {
          // Önceki seçimi temizle
          cont.querySelectorAll(`.gu-opt[data-qid="${qid}"]`).forEach(l => l.classList.remove('selected'));
          label.classList.add('selected');
          answers[qid] = { question_id: parseInt(qid), option_id: oid };
        } else {
          if (!answers[qid]) answers[qid] = { question_id: parseInt(qid), option_ids: [] };
          if (e.target.checked) {
            label.classList.add('selected');
            answers[qid].option_ids.push(oid);
          } else {
            label.classList.remove('selected');
            answers[qid].option_ids = answers[qid].option_ids.filter(id => id !== oid);
          }
        }
        updateSubmit();
      });
    });

    cont.querySelectorAll('.gu-stars').forEach(starsEl => {
      const qid = starsEl.dataset.qid;
      starsEl.querySelectorAll('.gu-star').forEach(starEl => {
        starEl.addEventListener('click', () => {
          const val = parseInt(starEl.dataset.val);
          starsEl.querySelectorAll('.gu-star').forEach((s, i) => {
            s.classList.toggle('on', (i + 1) <= val);
          });
          answers[qid] = { question_id: parseInt(qid), rating_value: val };
          updateSubmit();
        });
      });
    });

    cont.querySelectorAll('.gu-text').forEach(t => {
      t.addEventListener('input', () => {
        const qid = t.dataset.qid;
        answers[qid] = { question_id: parseInt(qid), text_answer: t.value };
        updateSubmit();
      });
    });

    function updateSubmit() {
      const required = questions.filter(q => q.is_required);
      const allDone = required.every(q => {
        const a = answers[q.id];
        if (!a) return false;
        if (q.question_type === 'multi_choice') return a.option_ids && a.option_ids.length > 0;
        if (q.question_type === 'rating') return a.rating_value > 0;
        if (q.question_type === 'text') return a.text_answer && a.text_answer.trim();
        return a.option_id != null;
      });
      document.getElementById('mandatory-submit-btn').disabled = !allDone;
    }

    document.getElementById('mandatory-submit-btn').onclick = async () => {
      const btn = document.getElementById('mandatory-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gönderiliyor...';

      // multi_choice → flatten
      const flatAnswers = [];
      Object.values(answers).forEach(a => {
        if (a.option_ids) {
          a.option_ids.forEach(oid => flatAnswers.push({ question_id: a.question_id, option_id: oid }));
        } else {
          flatAnswers.push(a);
        }
      });

      try {
        const r = await fetch('/api/surveys/' + surveyId + '/submit', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: flatAnswers })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Hata');

        // Başarı ekranı
        document.getElementById('mandatory-step2').classList.remove('active');
        document.getElementById('mandatory-success').classList.add('active');
        if (data.reward && data.reward.amount > 0) {
          document.getElementById('mandatory-success-title').textContent = '🎉 Tebrikler!';
          document.getElementById('mandatory-success-text').innerHTML =
            data.reward.type === 'balance'
              ? `<strong>${data.reward.amount} ₺</strong> bakiyene eklendi. Sitedeki işlemlerine devam edebilirsin.`
              : `<strong>${data.reward.amount} puan</strong> kazandın!`;
        }

        // Modal kapanınca scroll geri açılsın
        const obs = new MutationObserver(() => {
          if (!document.getElementById('mandatory-overlay')) {
            document.body.style.overflow = '';
            modalOpen = false;
            obs.disconnect();
          }
        });
        obs.observe(document.body, { childList: true });

      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Anketi Gönder';
        alert(err.message || 'Anket gönderilirken hata oluştu.');
      }
    };
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Başlat: 1 dk sonra ilk kontrol, sonra her 1 dk'da bir
  setTimeout(checkMandatory, 5000); // İlk kontrol 5 sn sonra (eğer önceki sekmeden 30dk geçtiyse)
  checkInterval = setInterval(checkMandatory, CHECK_INTERVAL_MS);
})();

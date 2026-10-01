// Published FAQs under the atlas on yeehaa.io, injected into the live
// preview. The answers are the brain's own captured drafts, shown as if
// published; the order is most asked first.
(() => {
  const FAQS = [
    {
      q: "What is ecosystem architecture?",
      a: `<p><strong>Ecosystem architecture</strong> is the practice of designing organizations, communities, and infrastructures as living systems rather than machines.</p>
<p>Instead of optimizing primarily for control, efficiency, and predictability, it focuses on creating the conditions for <strong>adaptation, trust, distributed coordination, and emergence</strong>.</p>
<h3>Core ideas</h3>
<ul><li><strong>Organizations are living systems.</strong> They evolve through relationships, feedback, experimentation, and shared values, not only through hierarchy and fixed processes.</li>
<li><strong>Structure should remain flexible.</strong> The goal is not to replace order with chaos, but to create structures that can adapt as circumstances change.</li>
<li><strong>Diversity creates resilience.</strong> Healthy ecosystems draw on multiple disciplines, perspectives, communities, and forms of knowledge.</li>
<li><strong>The architect eventually lets go.</strong> The aim is to cultivate a system that can function without depending on its original designer.</li></ul>
<p>In short, ecosystem architecture is about designing for <strong>emergence rather than control</strong>, and <strong>collective vitality rather than centralized ownership</strong>.</p>`,
    },
    {
      q: "What does a Knowledge Audit involve?",
      a: `<p>A <strong>Knowledge Audit</strong> is a structured review of how an organization creates, stores, shares, finds, and uses knowledge.</p>
<ol><li><strong>Mapping knowledge sources</strong>: documents, systems, repositories, experts, communities, and informal practices.</li>
<li><strong>Tracing knowledge flows</strong>: who creates it, who needs it, and where handoffs fail.</li>
<li><strong>Identifying gaps and risks</strong>: duplicated information, inaccessible expertise, undocumented decisions, and dependence on individual knowledge holders.</li>
<li><strong>Connecting knowledge to decisions</strong>: whether what is stored supports judgment rather than merely accumulating.</li>
<li><strong>Recommending improvements</strong> to structure, governance, tools, ownership, and workflows.</li></ol>
<p>The goal is not to inventory information, but to make an organization's knowledge <strong>usable, traceable, and shareable</strong>.</p>`,
    },
  ];
  const build = () => {
    const atlas = document.querySelector("section.atlas");
    if (!atlas || document.querySelector(".faq-band")) return;
    const band = document.createElement("section");
    band.className = "faq-band";
    band.innerHTML = `<div class="faq-band__inner"><div><h2>Asked before</h2><ul class="faq-band__questions">${FAQS.map(
      (faq, i) =>
        `<li class="${i === 0 ? "open" : ""}"><button aria-expanded="${i === 0}" data-i="${i}">${faq.q}</button><div class="faq-band__answer-in">${faq.a}</div></li>`,
    ).join("")}</ul></div><div class="faq-band__answer">${FAQS[0].a}</div></div>`;
    atlas.after(band);
    const left = atlas.querySelector(".atlas__talk h1")?.getBoundingClientRect().left ?? 144;
    if (window.innerWidth >= 768)
      band.querySelector(".faq-band__inner").style.marginLeft = `${left}px`;
    band.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-i]");
      if (!button) return;
      const i = Number(button.dataset.i);
      band.querySelectorAll(".faq-band__questions > li").forEach((li, j) => {
        li.classList.toggle("open", j === i && !li.classList.contains("open"));
        li.querySelector("button").setAttribute("aria-expanded", String(li.classList.contains("open")));
      });
      band.querySelector(".faq-band__answer").innerHTML = FAQS[i].a;
    });
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(build, 0));
})();

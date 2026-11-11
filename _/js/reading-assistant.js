/* Reading Assistant v1: article reading-progress bar + "Listen to Article" panel.
 *
 * Loaded by layouts/default.hbs *before* site.js (both deferred, so they run in
 * order). site.js calls window.ReadingAssistant.refresh() from enhanceContent(),
 * which runs on first load and after every in-place (single-page) navigation.
 *
 * Listening uses the browser's built-in Web Speech API. Nothing is sent to an
 * external service by this script; note that some browsers' own voices are
 * cloud-backed, which is outside this site's control.
 *
 * Deliberate limits (see documentation/docs/20-reading-assistant.md):
 *   - Speech synthesis exposes no duration or seek position, so every time shown
 *     is an estimate (marked "~") and the listening meter is not a scrubber.
 *   - Pause stops after the current sentence group and Resume restarts that group.
 *     The native pause()/resume() pair is unreliable across browsers.
 */
(function(){
  'use strict';
  var doc=document, html=doc.documentElement;
  var header=doc.querySelector('.docs-header');

  // ---------------------------------------------------------------- helpers
  var STORE_PREFIX='reading-assistant:';
  function load(key,fallback){try{var v=localStorage.getItem(STORE_PREFIX+key);return v===null?fallback:v;}catch(e){return fallback;}}
  function save(key,value){try{localStorage.setItem(STORE_PREFIX+key,String(value));}catch(e){}}
  function mq(query){return window.matchMedia?window.matchMedia(query):{matches:false};}
  function onChange(m,fn){if(m.addEventListener)m.addEventListener('change',fn);else if(m.addListener)m.addListener(fn);}
  var reducedMotion=mq('(prefers-reduced-motion: reduce)');
  // Keep in sync with css/site.css v20: below 1181px there is no third column,
  // so the assistant becomes a slide-in drawer.
  var drawerMQ=mq('(max-width: 1180px), (hover: none) and (pointer: coarse) and (max-height: 500px)');

  function headerBottom(){return header?Math.max(0,header.getBoundingClientRect().bottom):0;}
  function fmt(seconds){
    seconds=Math.max(0,Math.round(seconds));
    var m=Math.floor(seconds/60),s=seconds%60;
    return m+':'+(s<10?'0':'')+s;
  }
  // Unicode-aware where supported. Built with RegExp() so an older engine that
  // lacks \p{...} falls back instead of failing to parse the whole file.
  var WORD_CHAR=(function(){try{return new RegExp('[\\p{L}\\p{N}]','u');}catch(e){return /[0-9A-Za-z\u00C0-\u024F]/;}})();
  var PICTOGRAPH=(function(){
    try{return new RegExp('[\\p{Extended_Pictographic}\\uFE0F\\u20E3\\u200D]','gu');}
    catch(e){return /[\uFE0F\u20E3\u200D\u2600-\u27BF]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;}
  })();
  function countWords(text){
    var n=0;
    String(text).split(/\s+/).forEach(function(w){if(WORD_CHAR.test(w))n++;});
    return n;
  }
  function make(tag,cls,text){
    var el=doc.createElement(tag);
    if(cls)el.className=cls;
    if(text!=null)el.textContent=text;
    return el;
  }
  function playIcon(){
    var ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg'),path=doc.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    path.setAttribute('d','M8 5.5v13l11-6.5z');svg.appendChild(path);
    return svg;
  }

  // ======================================================= reading progress
  // Measures position within the article body only. 0% until the article starts
  // scrolling under the header, 100% once its last line is in view. Independent
  // of listening progress.
  var progress=(function(){
    var bar=doc.querySelector('.read-progress');
    var fill=bar&&bar.querySelector('.read-progress-fill');
    var label=doc.querySelector('.read-progress-label');
    var labelValue=label&&label.querySelector('.read-progress-value');
    var target=null,frame=0,last=-1,observer=null;

    function measure(){
      frame=0;
      if(!target||!target.isConnected)return;
      var rect=target.getBoundingClientRect();
      var top=headerBottom(),viewport=window.innerHeight||html.clientHeight;
      var travel=rect.height-(viewport-top);
      var pct;
      if(travel<=0)pct=rect.bottom<=viewport?100:0; // short article: complete once its end is visible
      else pct=(top-rect.top)/travel*100;
      pct=Math.max(0,Math.min(100,pct));
      fill.style.transform='scaleX('+(pct/100)+')';
      var rounded=Math.round(pct);
      if(rounded!==last){
        last=rounded;
        // aria-valuenow only: progress bars are not live regions, so scrolling is not announced.
        bar.setAttribute('aria-valuenow',String(rounded));
        bar.setAttribute('aria-valuetext',rounded+'% of the article read');
        if(labelValue)labelValue.textContent=rounded+'%';
      }
    }
    function schedule(){if(target&&!frame)frame=window.requestAnimationFrame(measure);}

    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('load',schedule);
    // <details> (Show Code) changes the article height. ResizeObserver catches it;
    // this capture listener covers browsers without ResizeObserver.
    doc.addEventListener('toggle',schedule,true);

    function attach(article,enabled){
      if(!bar||!fill)return;
      if(observer)observer.disconnect();
      target=enabled?article:null;
      bar.hidden=!target;
      if(label)label.hidden=!target;
      last=-1;
      if(!target)return;
      if(window.ResizeObserver){
        observer=observer||new ResizeObserver(schedule);
        observer.observe(target);
      }
      schedule();
    }
    return {attach:attach};
  })();

  // ============================================================ narration
  var synth=('speechSynthesis' in window)&&typeof window.SpeechSynthesisUtterance==='function'?window.speechSynthesis:null;

  // Speaking-time estimate. Speech engines report no duration, so this is an
  // assumption (about 160 words a minute at 1x, plus a short pause per utterance).
  // MAX_CHUNK keeps each utterance to roughly 10 seconds at 1x, comfortably under
  // the length at which Chrome's online voices are known to cut out.
  var SPEECH_WPM=160,PAUSE_SECS=0.35,MAX_CHUNK=160;

  var CODE_BLOCKS='details,.listingblock,.literalblock';
  // td.content = admonition text; th = table header cells (body cells hold <p>).
  var CANDIDATES='h2,h3,h4,h5,h6,p,dt,th,td.content';
  // Never read: code, collapsed blocks, UI chrome, hidden nodes and author opt-outs.
  var EXCLUDE=['pre','details','.listingblock','.literalblock','.code-toolbar','.colist','.footnotes','sup.footnote',
    '.article-chips','.article-meta','.no-narration','[data-speech-exclude]','[hidden]','[aria-hidden="true"]',
    'script','style','svg','button','nav','.toc','.reading-assistant'].join(',');

  // Text of an element, skipping excluded descendants. Text nodes only, never
  // innerHTML. The caller has already checked the element itself is allowed.
  function readable(el){
    var walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),parts=[],node;
    while((node=walker.nextNode())){
      var parent=node.parentElement;
      if(parent&&parent!==el&&parent.closest(EXCLUDE))continue;
      parts.push(node.nodeValue);
    }
    return parts.join('');
  }

  // Light-touch notation fixes for common complexity/operator symbols. This is
  // not a pronunciation engine; generics, APIs and maths may still read oddly.
  function clean(text){
    return String(text)
      .replace(PICTOGRAPH,' ')
      .replace(/\bO\(\s*([^()]{1,40}?)\s*\)/g,function(_,inner){return 'O of '+inner;})
      .replace(/\s*\^\s*/g,' to the power ')
      // Order matters: multi-character operators before the bare "=" rule.
      .replace(/\s*(?:->|=>|\u2192|\u21D2)\s*/g,' to ')
      .replace(/\s*(?:<=|\u2264)\s*/g,' less than or equal to ')
      .replace(/\s*(?:>=|\u2265)\s*/g,' greater than or equal to ')
      .replace(/\s*(?:!==?|\u2260)\s*/g,' is not equal to ')
      .replace(/\s*={1,3}\s*/g,' equals ')
      .replace(/\s+/g,' ')
      .trim();
  }

  // Sentence groups of at most MAX_CHUNK characters. Short utterances avoid the
  // Chrome bug where long speech stops early, and keep Pause/Resume close.
  // Split at sentences, then clauses, then words, packing pieces back together
  // up to MAX_CHUNK. (No regex lookbehind: older Safari cannot parse it.)
  var SPLITTERS=[
    /[^.!?\u2026]+(?:[.!?\u2026]+["'\u201D\u2019)\]]*\s*|$)/g,
    /[^,;:]+(?:[,;:]+\s*|$)/g,
    /\S+\s*/g
  ];
  function splitText(text,level){
    level=level||0;
    if(text.length<=MAX_CHUNK||level>=SPLITTERS.length)return text.trim()?[text.trim()]:[];
    var parts=text.match(SPLITTERS[level])||[text],chunks=[],current='';
    function flush(){if(current.trim())chunks.push(current.trim());current='';}
    parts.forEach(function(part){
      if(part.length>MAX_CHUNK){flush();chunks.push.apply(chunks,splitText(part,level+1));return;}
      if(current&&(current+part).length>MAX_CHUNK)flush();
      current+=part;
    });
    flush();
    return chunks;
  }

  // Headings get a full stop so the voice pauses, unless they already end in punctuation.
  function sentence(text){text=String(text).trim();return /[.!?:\u2026]$/.test(text)?text:text+'.';}

  // Ordered list of utterances for the article, plus its top-level sections.
  function collect(article){
    var items=[],sections=[],current=-1,admonitions=[];
    function add(text,el,kind){
      text=clean(text);
      if(!text)return;
      splitText(text).forEach(function(part){
        var words=countWords(part);
        if(!words)return;
        items.push({text:part,el:el,kind:kind,section:current,secs:words/SPEECH_WPM*60+PAUSE_SECS});
      });
    }

    var head=article.querySelector('.article-header');
    if(head){
      var h1=head.querySelector('h1');
      if(h1)add(sentence(readable(h1)),h1,'heading');
      var subtitle=head.querySelector('.article-subtitle');
      if(subtitle)add(readable(subtitle),subtitle,'text');
    }

    var nodes=article.querySelectorAll(CANDIDATES+','+CODE_BLOCKS);
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      if(head&&head.contains(el))continue;
      if(el.closest('.no-narration,[data-speech-exclude],[hidden],[aria-hidden="true"]'))continue;

      if(el.matches(CODE_BLOCKS)){
        // Outermost code container only; one notice per run of consecutive blocks.
        if(el.parentElement&&el.parentElement.closest(CODE_BLOCKS))continue;
        // A collapsible block without code is skipped silently.
        if(el.tagName==='DETAILS'&&!el.querySelector('pre,.listingblock,.literalblock'))continue;
        var previous=items[items.length-1];
        if(previous&&previous.kind==='code'&&previous.section===current)continue;
        add('Code example omitted.',el,'code');
        continue;
      }

      if(el.closest(EXCLUDE))continue;
      if(el.matches('td.content')&&el.querySelector('p'))continue; // its paragraphs are read instead
      if(!el.getClientRects().length)continue;                      // hidden by CSS

      var text=readable(el);
      if(el.tagName==='H2'&&el.parentElement&&el.parentElement.classList.contains('sect1')){
        current=sections.length;
        sections.push({id:el.id||'',label:clean(text)||('Section '+(current+1)),el:el,first:items.length});
        add(sentence(text),el,'heading');
        continue;
      }
      if(/^H[3-6]$/.test(el.tagName)){add(sentence(text),el,'heading');continue;}

      var admonition=el.closest('.admonitionblock');
      if(admonition&&admonitions.indexOf(admonition)<0){
        admonitions.push(admonition);
        var type=(admonition.className.match(/\b(note|tip|important|warning|caution)\b/)||[])[1];
        if(type)text=type.charAt(0).toUpperCase()+type.slice(1)+': '+text;
      }
      add(text,el,'text');
    }

    var elapsed=0,next=0;
    sections.forEach(function(section,index){
      section.end=index+1<sections.length?sections[index+1].first:items.length;
      for(;next<section.first;next++)elapsed+=items[next].secs;
      section.startSecs=elapsed;
      section.playable=items.slice(section.first,section.end).some(function(item){return item.kind==='text';});
    });
    return {items:items,sections:sections};
  }

  // ------------------------------------------------------------- player state
  var state={
    items:[],sections:[],
    rangeStart:0,index:0,end:0,partial:0,
    mode:'all',section:-1,
    playing:false,paused:false,finished:false,
    token:0,utterance:null,status:'',
    rate:(function(){var r=parseFloat(load('rate','1'));return r>=0.5&&r<=2?r:1;})(),
    follow:load('follow','1')!=='0'
  };
  var panel=null,article=null,openBtn=null,highlighted=null;

  function rangeSecs(from,to){var s=0;for(var i=from;i<to;i++)s+=state.items[i].secs;return s;}
  function hasReadableText(){return state.items.some(function(item){return item.kind==='text';});}

  // Fixed site voice; readers do not choose one. "Google UK English Male" is a
  // Chrome (desktop) voice, and it is cloud-backed: Chrome sends the text to Google.
  // Other browsers do not have it, so fall back to any British English voice,
  // then to the browser's default. Looked up per utterance because Chrome loads
  // its voice list asynchronously.
  var PREFERRED_VOICE='Google UK English Male';
  function selectedVoice(){
    if(!synth)return null;
    var voices=synth.getVoices()||[],fallback=null;
    for(var i=0;i<voices.length;i++){
      var v=voices[i];
      if(v.name===PREFERRED_VOICE)return v;
      if(!fallback&&/^en[-_]GB$/i.test(v.lang||''))fallback=v;
    }
    return fallback;
  }

  function clearHighlight(){
    if(highlighted)highlighted.classList.remove('ra-speaking');
    highlighted=null;
  }
  function highlight(el){
    if(!state.follow||!el){clearHighlight();return;}
    if(highlighted===el)return;
    clearHighlight();
    highlighted=el;
    el.classList.add('ra-speaking');
    var rect=el.getBoundingClientRect(),top=headerBottom(),viewport=window.innerHeight||html.clientHeight;
    if(rect.top<top||rect.bottom>viewport){
      el.scrollIntoView({block:rect.height>viewport-top?'start':'center',behavior:reducedMotion.matches?'auto':'smooth'});
    }
  }

  function setStatus(text){
    if(state.status===text)return; // unchanged text is not re-announced
    state.status=text;
    var node=panel&&panel.querySelector('.ra-status');
    if(node)node.textContent=text;
  }

  function renderMeter(){
    if(!panel)return;
    var meter=panel.querySelector('.ra-meter'),fill=panel.querySelector('.ra-meter-fill'),time=panel.querySelector('.ra-time');
    var total=rangeSecs(state.rangeStart,state.end),done;
    if(state.finished)done=total;
    else{
      done=rangeSecs(state.rangeStart,Math.min(state.index,state.end));
      if(state.playing&&state.index<state.end)done+=state.items[state.index].secs*state.partial;
    }
    var fraction=total?Math.min(1,done/total):0;
    if(fill)fill.style.transform='scaleX('+fraction+')';
    if(meter){
      var pct=Math.round(fraction*100);
      if(meter.getAttribute('aria-valuenow')!==String(pct)){
        meter.setAttribute('aria-valuenow',String(pct));
        meter.setAttribute('aria-valuetext',pct+'% listened');
      }
    }
    if(time)time.textContent=fmt(done/state.rate)+' / ~'+fmt(total/state.rate);
  }

  function render(){
    if(!panel)return;
    var play=panel.querySelector('.ra-play'),stop=panel.querySelector('.ra-stop');
    var playable=!!synth&&hasReadableText();
    if(play){
      play.disabled=!playable;
      play.classList.toggle('is-playing',state.playing);
      play.setAttribute('aria-label',state.playing?'Pause':state.paused?'Resume':'Play article');
    }
    if(stop)stop.disabled=!(state.playing||state.paused);
    renderMeter();
    var rows=panel.querySelectorAll('.ra-section');
    var active=state.playing||state.paused?(state.items[state.index]||{}).section:-1;
    for(var i=0;i<rows.length;i++){
      var on=i===active;
      rows[i].classList.toggle('is-active',on);
      if(on)rows[i].setAttribute('aria-current','true');else rows[i].removeAttribute('aria-current');
    }
    if(openBtn)openBtn.classList.toggle('is-speaking',state.playing);
    if(!synth)return;
    if(!playable)setStatus('Nothing to read aloud on this page');
    else if(state.playing)setStatus(state.mode==='section'?'Speaking: '+((state.sections[state.section]||{}).label||'section'):'Speaking');
    else if(state.paused)setStatus('Paused');
    else if(state.finished)setStatus('Finished');
    else if(state.status!=='Stopped')setStatus('Ready');
  }

  function speakCurrent(token){
    if(token!==state.token)return;
    if(state.index>=state.end){finish();return;}
    var item=state.items[state.index];
    var u=new SpeechSynthesisUtterance(item.text);
    u.lang=html.lang||'en';
    u.rate=state.rate;
    var voice=selectedVoice();
    if(voice)u.voice=voice;
    u.onstart=function(){if(token!==state.token)return;state.partial=0;highlight(item.el);renderMeter();};
    u.onboundary=function(e){
      if(token!==state.token||!item.text.length)return;
      state.partial=Math.min(1,(e.charIndex||0)/item.text.length);
      renderMeter();
    };
    u.onend=function(){
      if(token!==state.token)return;
      state.index++;state.partial=0;
      speakCurrent(token);
    };
    u.onerror=function(e){
      if(token!==state.token)return;
      var error=e&&e.error;
      if(error==='interrupted'||error==='canceled')return; // our own cancel()
      state.token++;
      state.playing=false;state.paused=false;
      clearHighlight();
      setStatus(error==='not-allowed'?'Press Play to start listening':'Speech stopped: no usable voice on this device');
      render();
    };
    // Keep a reference: Chrome can garbage-collect a pending utterance and never fire onend.
    state.utterance=u;
    if(synth.paused)synth.resume();
    synth.speak(u);
  }

  // One reading session at a time: every start/pause/stop bumps the token, and
  // callbacks from older utterances see a stale token and do nothing.
  function start(rangeStart,from,end,mode,section){
    if(!synth)return;
    var token=++state.token;
    var busy=synth.speaking||synth.pending;
    synth.cancel();
    state.rangeStart=rangeStart;state.index=from;state.end=end;
    state.mode=mode;state.section=section;
    state.playing=true;state.paused=false;state.finished=false;state.partial=0;
    render();
    // Chrome can drop an utterance queued right after cancel(). Only delay in
    // that case, so the first Play stays inside the click (iOS requires that).
    if(busy)setTimeout(function(){speakCurrent(token);},60);
    else speakCurrent(token);
  }
  function pause(){
    state.token++;
    if(synth)synth.cancel();
    state.playing=false;state.paused=true;state.partial=0;
    render();
  }
  function resume(){start(state.rangeStart,state.index,state.end,state.mode,state.section);}
  function finish(){
    state.token++;
    state.playing=false;state.paused=false;state.finished=true;
    clearHighlight();
    render();
  }
  function stop(silent){
    state.token++;
    if(synth&&(synth.speaking||synth.pending))synth.cancel();
    var was=state.playing||state.paused;
    state.playing=false;state.paused=false;state.finished=false;
    state.mode='all';state.section=-1;
    state.rangeStart=0;state.index=0;state.end=state.items.length;state.partial=0;
    clearHighlight();
    if(!silent&&was)setStatus('Stopped');
    render();
  }

  function playArticle(){
    if(state.playing){pause();return;}
    if(state.paused){resume();return;}
    if(state.status==='Stopped')state.status='';
    start(0,0,state.items.length,'all',-1);
  }
  function playSection(index){
    var section=state.sections[index];
    if(!section||!section.playable)return;
    start(section.first,section.first,section.end,'section',index);
  }

  // ------------------------------------------------------------- panel markup
  // Ask for the voice list early so Chrome has loaded it by the first Play.
  if(synth){try{synth.getVoices();}catch(e){}}

  function renderSections(){
    var card=panel.querySelector('.ra-jump'),list=panel.querySelector('.ra-sections');
    if(!card||!list)return;
    list.textContent='';
    card.hidden=!state.sections.length;
    state.sections.forEach(function(section,i){
      var row=make('li','ra-section');
      var link=make(section.id?'a':'span','ra-section-link');
      if(section.id)link.href='#'+encodeURIComponent(section.id);
      link.appendChild(make('span','ra-section-num',(i+1)+'.'));
      link.appendChild(make('span','ra-section-label',section.label));
      row.appendChild(link);
      var button=make('button','ra-section-play');
      button.type='button';
      button.appendChild(playIcon());
      var time=make('span','ra-section-time');
      if(synth&&section.playable){
        button.setAttribute('data-section',String(i));
        button.setAttribute('aria-label','Listen to section: '+section.label);
        time.textContent='~'+fmt(section.startSecs/state.rate);
        time.title='Estimated start time in the full article';
      }else{
        button.disabled=true;
        var why=synth?'Code only, nothing to read aloud':'Listening is not available in this browser';
        button.setAttribute('aria-label',section.label+': '+why);
        button.title=why;
        if(synth)time.textContent='Code';
      }
      if(!synth)button.hidden=true;
      row.appendChild(button);
      row.appendChild(time);
      list.appendChild(row);
    });
  }

  function setupListen(){
    var card=panel.querySelector('.ra-listen');
    if(!card)return;
    card.hidden=false;
    var ready=card.querySelector('.ra-ready'),unsupported=card.querySelector('.ra-unsupported');
    if(!synth){if(ready)ready.hidden=true;if(unsupported)unsupported.hidden=false;return;}
    var rate=card.querySelector('.ra-rate');
    if(rate){
      rate.value=String(state.rate);
      if(rate.value!==String(state.rate)){state.rate=1;rate.value='1';}
    }
    var follow=card.querySelector('.ra-follow');
    if(follow)follow.checked=state.follow;
    state.status='';
  }

  // ------------------------------------------------ open / close and drawer
  var backdrop=make('div','ra-backdrop');
  backdrop.setAttribute('aria-hidden','true');
  doc.body.appendChild(backdrop);
  var drawerOpen=false;
  html.classList.toggle('ra-closed',load('closed','0')==='1');

  function syncOpenButton(){
    if(!openBtn)return;
    openBtn.setAttribute('aria-expanded',String(drawerMQ.matches?drawerOpen:!html.classList.contains('ra-closed')));
  }
  function focusPanel(){
    var title=panel&&panel.querySelector('.ra-title');
    if(title){title.setAttribute('tabindex','-1');try{title.focus({preventScroll:true});}catch(e){title.focus();}}
  }
  function openDrawer(){
    if(!panel)return;
    html.style.setProperty('--ra-top',Math.round(headerBottom())+'px');
    drawerOpen=true;
    html.classList.add('ra-drawer-open');
    syncOpenButton();
    focusPanel();
  }
  function closeDrawer(restoreFocus){
    if(!drawerOpen)return;
    drawerOpen=false;
    html.classList.remove('ra-drawer-open');
    syncOpenButton();
    if(restoreFocus&&openBtn)openBtn.focus({preventScroll:true});
  }
  function onOpen(){
    if(drawerMQ.matches){if(drawerOpen)closeDrawer(true);else openDrawer();return;}
    html.classList.remove('ra-closed');
    save('closed','0');
    syncOpenButton();
    focusPanel();
  }
  function onClose(){
    if(drawerMQ.matches){closeDrawer(true);return;} // speech keeps going behind a closed drawer
    stop(true); // desktop: the controls disappear, so the audio should too
    html.classList.add('ra-closed');
    save('closed','1');
    syncOpenButton();
    if(openBtn)openBtn.focus({preventScroll:true});
  }
  onChange(drawerMQ,function(){closeDrawer(false);syncOpenButton();});

  backdrop.addEventListener('click',function(){closeDrawer(true);});
  doc.addEventListener('keydown',function(e){if((e.key==='Escape'||e.key==='Esc')&&drawerOpen)closeDrawer(true);});

  doc.addEventListener('click',function(e){
    var t=e.target,b;
    if(!t||!t.closest)return;
    if((b=t.closest('.ra-open'))){onOpen();return;}
    if(t.closest('.mobile-nav-toggle')){closeDrawer(false);return;} // one drawer at a time
    if(!t.closest('.reading-assistant'))return;
    if((b=t.closest('.ra-play'))){if(!b.disabled)playArticle();return;}
    if((b=t.closest('.ra-stop'))){stop(false);return;}
    if((b=t.closest('.ra-section-play'))){if(!b.disabled)playSection(Number(b.getAttribute('data-section')));return;}
    if(t.closest('.ra-close')){onClose();return;}
    if(t.closest('.ra-section-link'))closeDrawer(false);
  });

  doc.addEventListener('change',function(e){
    var t=e.target;
    if(!t||!t.closest||!t.closest('.reading-assistant'))return;
    if(t.classList.contains('ra-rate')){
      var r=parseFloat(t.value);
      state.rate=r>=0.5&&r<=2?r:1;
      save('rate',state.rate);
      renderSections();
      if(state.playing)resume();else render();
    }else if(t.classList.contains('ra-follow')){
      state.follow=t.checked;
      save('follow',state.follow?'1':'0');
      if(!state.follow)clearHighlight();
      else if(state.playing)highlight((state.items[state.index]||{}).el);
    }
  });

  // Leaving the page (normal navigation, reload, closing the tab) ends speech.
  window.addEventListener('pagehide',function(){if(synth)synth.cancel();});

  // ----------------------------------------------------------------- refresh
  var initialized=false;
  function refresh(){
    initialized=true;
    stop(true); // in-place navigation: never keep reading the previous article
    closeDrawer(false);
    panel=doc.querySelector('.docs-toc.reading-assistant');
    article=doc.querySelector('#article-main .article-body');
    openBtn=doc.querySelector('#article-main .ra-open');
    progress.attach(article,!!(article&&article.hasAttribute('data-reading-progress')));
    html.classList.toggle('has-reading-assistant',!!panel);
    if(!panel||!article){state.items=[];state.sections=[];return;}

    var data=collect(article);
    state.items=data.items;
    state.sections=data.sections;
    state.rangeStart=0;state.index=0;state.end=state.items.length;state.finished=false;

    setupListen();
    renderSections();
    render();
    if(openBtn){openBtn.hidden=false;syncOpenButton();}
  }

  window.ReadingAssistant={refresh:refresh,stop:function(){stop(false);}};
  // site.js normally calls refresh(); this covers a page where it did not run.
  doc.addEventListener('DOMContentLoaded',function(){if(!initialized)refresh();});
})();

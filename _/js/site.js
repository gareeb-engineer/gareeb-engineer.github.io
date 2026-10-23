(function(){
  'use strict';
  var siteScriptSrc=(document.currentScript&&document.currentScript.src)||'';

  // Rebase internal xrefs rendered from header-links.adoc to that source page.
  // Otherwise a relative xref works on header-links.html but breaks when the
  // same list is embedded in another component/module/deep article.
  document.querySelectorAll('.header-adoc-nav[data-header-source-url]').forEach(function(nav){
    var originalPage;
    try { originalPage = new URL(nav.getAttribute('data-header-source-url'), document.baseURI); }
    catch(e) { return; }
    nav.querySelectorAll('a[href]').forEach(function(anchor){
      var href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return;
      try { anchor.href = new URL(href, originalPage).href; } catch(e) {}
      if (anchor.target === '_blank') anchor.rel = 'noopener noreferrer';
    });
  });

  var toggle=document.querySelector('.mobile-nav-toggle');
  var sidebar=document.querySelector('.docs-sidebar');
  var header=document.querySelector('.docs-header');
  var docNav=sidebar&&sidebar.querySelector('nav[aria-label="Documentation pages"]');
  // v9: "phone layout" = narrow screens, or touch phones held sideways (short screen).
  // Keep this query identical to the one in css/site.css. Laptops never match it.
  var phoneMQ=window.matchMedia('(max-width: 750px), (hover: none) and (pointer: coarse) and (max-height: 500px)');

  // v12: fingerprint of the sidebar's page list, taken before any clean-up below.
  // In-place navigation is only used between pages that share this exact sidebar.
  function navSignature(nav,base){
    if(!nav)return '';
    return Array.prototype.map.call(nav.querySelectorAll('a[href]'),function(a){
      try{return new URL(a.getAttribute('href'),base).pathname;}catch(e){return '';}
    }).sort().join('|');
  }
  var initialNavSignature=navSignature(docNav,location.href);

  // Phone layout hides the header links, so copy them (already rebased above) into the top of the drawer.
  // The copy is display:none outside the phone layout.
  var headerLinks=document.querySelector('.docs-header .docs-toplinks');
  var sidebarInner=sidebar&&sidebar.querySelector('.sidebar-inner');
  if(headerLinks&&sidebarInner&&headerLinks.querySelector('a[href]')){
    var drawerLinks=document.createElement('nav');
    drawerLinks.className='drawer-links';
    drawerLinks.setAttribute('aria-label','Contact and profiles');
    var linkList=document.createElement('ul');
    headerLinks.querySelectorAll('a[href]').forEach(function(a){
      var li=document.createElement('li'); var copy=a.cloneNode(true);
      copy.removeAttribute('class'); li.appendChild(copy); linkList.appendChild(li);
    });
    drawerLinks.appendChild(linkList);
    sidebarInner.insertBefore(drawerLinks,sidebarInner.firstChild);
  }

  // Slide-in navigation drawer (phone layout only; the button is hidden elsewhere).
  // Opens just below the header wherever the reader is, locks page scroll, and closes on
  // backdrop tap, Escape, choosing a page, or leaving the phone layout.
  var closeDrawer=function(){};
  if(toggle&&sidebar){
    var backdrop=document.createElement('div');
    backdrop.className='nav-backdrop';
    backdrop.setAttribute('aria-hidden','true');
    document.body.appendChild(backdrop);
    var openLabel=toggle.textContent, closeLabel='✕ Close';
    var isOpen=function(){return sidebar.classList.contains('open');};
    var placeDrawer=function(){
      var bottom=header?Math.max(0,Math.round(header.getBoundingClientRect().bottom)):0;
      document.documentElement.style.setProperty('--drawer-top',bottom+'px');
    };
    var setDrawer=function(open,restoreFocus){
      if(open)placeDrawer();
      sidebar.classList.toggle('open',open);
      backdrop.classList.toggle('is-visible',open);
      document.documentElement.classList.toggle('nav-open',open);
      toggle.setAttribute('aria-expanded',String(open));
      toggle.textContent=open?closeLabel:openLabel;
      if(open){sidebar.setAttribute('tabindex','-1');sidebar.focus({preventScroll:true});}
      else if(restoreFocus){toggle.focus({preventScroll:true});}
    };
    closeDrawer=function(){if(isOpen())setDrawer(false,false);};
    toggle.addEventListener('click',function(){setDrawer(!isOpen(),false);});
    backdrop.addEventListener('click',function(){setDrawer(false,true);});
    document.addEventListener('keydown',function(e){if((e.key==='Escape'||e.key==='Esc')&&isOpen())setDrawer(false,true);});
    sidebar.addEventListener('click',function(e){if(isOpen()&&e.target.closest('a[href]'))setDrawer(false,false);});
    var leavePhoneLayout=function(){if(!phoneMQ.matches&&isOpen())setDrawer(false,false);};
    if(phoneMQ.addEventListener)phoneMQ.addEventListener('change',leavePhoneLayout);
    else if(phoneMQ.addListener)phoneMQ.addListener(leavePhoneLayout);
    window.addEventListener('resize',function(){if(isOpen())placeDrawer();});
  }

  // Phone layout: diagrams shrink to the screen width, so let readers open them at full size.
  function enhanceImages(root){
    if(!phoneMQ.matches)return;
    root.querySelectorAll('.article-body .imageblock img').forEach(function(img){
      if(img.closest('a'))return;
      var wrap=function(){
        if(img.closest('a'))return;
        if(!img.naturalWidth||img.naturalWidth<=img.getBoundingClientRect().width*1.15)return;
        var link=document.createElement('a');
        link.href=img.currentSrc||img.src; link.target='_blank'; link.rel='noopener'; link.className='img-zoom';
        link.title='Open full-size image';
        img.parentNode.insertBefore(link,img); link.appendChild(img);
        var hint=document.createElement('span');
        hint.className='img-zoom-hint'; hint.setAttribute('aria-hidden','true'); hint.textContent='Tap to view full size';
        link.appendChild(hint);
      };
      if(img.complete)wrap(); else img.addEventListener('load',wrap,{once:true});
    });
  }

  // Antora may emit a blank navigation-group heading for malformed or unlabeled
  // parent nodes. Do not leave an arrow-only toggle in the sidebar.
  // Also normalize text in headings that contain nested inline markup.
  document.querySelectorAll('.nav-group > .nav-toggle').forEach(function(button){
    var label = button.querySelector('.nav-label');
    if (!label) return;
    var text = (label.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      var descendants = button.parentElement.querySelectorAll('.nav-children .nav-row a, .nav-children .nav-toggle .nav-label');
      for (var i=0; i<descendants.length; i++) {
        var candidate=(descendants[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (candidate) { text=candidate; break; }
      }
      if (!text) text='Untitled section';
      button.dataset.fallbackLabel='true';
    }
    label.textContent=text;
  });

  // UI display normalization for manually authored navigation:
  // * Topic and first child both named "Data Structure" => rename child "Overview".
  // * If that child has nested subtopics, promote them one indentation level.
  // This preserves the overview URL, avoids duplicate visible titles, and leaves
  // nav.adoc untouched. It only applies to exact duplicate first-child labels.
  document.querySelectorAll('.docs-sidebar .nav-group:not(.nav-linked-group)').forEach(function(group){
    var toggle = group.querySelector(':scope > .nav-toggle');
    var childList = group.querySelector(':scope > .nav-children > ul.nav-tree');
    if (!toggle || !childList) return;
    var label = toggle.querySelector('.nav-label');
    var first = childList.querySelector(':scope > li.nav-item:first-child');
    if (!label || !first) return;
    var link = first.querySelector(':scope > .nav-row > a, :scope > .nav-linked-group > .nav-linked-row > a');
    if (!link) return;
    function title(x){return (x.textContent||'').replace(/\s+/g,' ').trim().toLocaleLowerCase();}
    if (!title(label) || title(label)!==title(link)) return;
    link.textContent = 'Overview';
    link.setAttribute('title', 'Open ' + label.textContent.trim() + ' overview');
    var subitems = first.querySelector(':scope > ul.nav-tree, :scope > .nav-linked-group > .nav-children > ul.nav-tree');
    if (!subitems) return;
    var rest = first.nextSibling;
    Array.prototype.slice.call(subitems.children).forEach(function(item){childList.insertBefore(item,rest);});
    // The overview child no longer needs its own empty dropdown.
    if (first.querySelector(':scope > .nav-linked-group')) {
      var oldGroup=first.querySelector(':scope > .nav-linked-group');
      var row=oldGroup.querySelector(':scope > .nav-linked-row');
      if (row) {
        var oldButton=row.querySelector('button.nav-toggle');
        if (oldButton) oldButton.remove();
        first.insertBefore(row,oldGroup);
      }
      oldGroup.remove();
    } else {
      subitems.remove();
    }
  });

  // Highlight the active Antora article before initializing expandable groups.
  function markCurrent(){
    var here=window.location.pathname;
    document.querySelectorAll('.docs-sidebar a.is-current, .docs-sidebar a[aria-current]').forEach(function(a){
      a.classList.remove('is-current'); a.removeAttribute('aria-current');
    });
    document.querySelectorAll('.docs-sidebar a').forEach(function(a){
      try{if(new URL(a.href).pathname===here){a.classList.add('is-current');a.setAttribute('aria-current','page');}}
      catch(e){}
    });
  }
  markCurrent();

  // Avoid native <details>/<summary> rendering: labels always remain visible.
  // A semantic button handles keyboard interaction and announced expanded state.
  function getGroupToggle(group){
    return group.querySelector(':scope > .nav-toggle, :scope > .nav-linked-row > .nav-toggle');
  }
  function setGroupOpen(group,open){
    var button=getGroupToggle(group);
    if(!button)return;
    group.classList.toggle('is-collapsed',!open);
    button.setAttribute('aria-expanded',String(open));
    var chevron=button.querySelector('.nav-chevron');
    if(chevron)chevron.textContent=open?'▾':'▸';
  }
  document.querySelectorAll('.nav-group').forEach(function(group,i){
    var button=getGroupToggle(group);
    var children=group.querySelector(':scope > .nav-children');
    if(!button||!children)return;
    if(!children.id)children.id='nav-children-'+(i+1);
    button.setAttribute('aria-controls',children.id);
    // Keep the group containing the current article expanded; collapse others.
    setGroupOpen(group,!!group.querySelector('a[aria-current="page"]'));
  });
  document.addEventListener('click',function(event){
    var button=event.target.closest('.nav-toggle');
    if(!button)return;
    var group=button.closest('.nav-group');
    if(group)setGroupOpen(group,button.getAttribute('aria-expanded')!=='true');
  });

  var filter=document.getElementById('nav-filter');
  if(filter&&sidebar){
    filter.addEventListener('input',function(){
      var q=filter.value.toLowerCase().trim();
      var entries=Array.prototype.slice.call(sidebar.querySelectorAll('li.nav-item'));
      entries.reverse().forEach(function(li){
        var row=li.querySelector(':scope > .nav-row, :scope > .nav-group > .nav-row');
        var label=row?row.textContent.toLowerCase():'';
        var children=li.querySelectorAll('li.nav-item');
        var childMatch=Array.prototype.some.call(children,function(child){return !child.hidden;});
        li.hidden=!!q&&!label.includes(q)&&!childMatch;
        var group=li.querySelector(':scope > .nav-group');
        if(q&&group&&(childMatch||label.includes(q)))setGroupOpen(group,true);
      });
    });
  }

  function buildToc(){
    var toc=document.getElementById('js-local-toc');
    var article=document.querySelector('.article-body');
    if(!toc||!article)return;
    toc.textContent='';
    article.querySelectorAll('h2[id], h3[id]').forEach(function(h){var a=document.createElement('a');a.href='#'+encodeURIComponent(h.id);a.textContent=h.textContent;a.className=h.tagName==='H3'?'level3':'level2';toc.appendChild(a);});
  }

  // v10: dark code blocks. Adds a language label, Copy and Open buttons, line numbers,
  // highlighted lines and syntax colours. Highlighted lines come from `hl-N` / `hl-A-B`
  // classes that lib/code-line-highlight.js adds for [source,java,highlight=...].
  // The bundled highlight.js is only downloaded on pages that contain code.
  // Opt out of line numbers on one block with [source,java,role=no-linenums].
  var enhanceCode=(function(){
    var LANG_NAMES={java:'Java',kotlin:'Kotlin',kt:'Kotlin',groovy:'Groovy',gradle:'Gradle',scala:'Scala',
      js:'JavaScript',javascript:'JavaScript',ts:'TypeScript',typescript:'TypeScript',json:'JSON',yaml:'YAML',yml:'YAML',
      xml:'XML',html:'HTML',css:'CSS',scss:'SCSS',sql:'SQL',sh:'Shell',shell:'Shell',bash:'Bash',zsh:'Zsh',console:'Console',
      powershell:'PowerShell',ps1:'PowerShell',python:'Python',py:'Python',go:'Go',golang:'Go',rust:'Rust',rs:'Rust',
      c:'C',cpp:'C++','c++':'C++',csharp:'C#',cs:'C#',ruby:'Ruby',rb:'Ruby',php:'PHP',dockerfile:'Dockerfile',docker:'Dockerfile',
      ini:'INI',properties:'Properties',toml:'TOML',hcl:'HCL',terraform:'Terraform',tf:'Terraform',markdown:'Markdown',md:'Markdown',
      diff:'Diff',graphql:'GraphQL',swift:'Swift',makefile:'Makefile',text:'Text',txt:'Text',plaintext:'Text'};
    // In these languages a Capitalized word is almost always a type (String, Integer, List...).
    var TYPE_CASE_LANGS={java:1,kotlin:1,kt:1,groovy:1,gradle:1,scala:1,csharp:1,cs:1,typescript:1,ts:1,swift:1};
    var SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
    var ICON_COPY=SVG+'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
    var ICON_DONE=SVG+'<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var ICON_OPEN=SVG+'<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>';

    function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}

    // Read the code as plain text and keep Asciidoctor callouts (<1>, <2>...) aside with their line number.
    function readCode(code){
      var text='',callouts={};
      (function walk(node){
        var kids=Array.prototype.slice.call(node.childNodes);
        for(var i=0;i<kids.length;i++){
          var child=kids[i];
          if(child.nodeType===3){text+=child.nodeValue;continue;}
          if(child.nodeType!==1)continue;
          if(child.classList.contains('conum')){
            var html=child.outerHTML, next=kids[i+1];
            if(child.tagName==='I'&&next&&next.nodeType===1&&next.tagName==='B'){html+=next.outerHTML;i++;}
            var line=text.split('\n').length;
            (callouts[line]=callouts[line]||[]).push(html);
            continue;
          }
          walk(child);
        }
      })(code);
      text=text.replace(/[ \t]+(?=\n|$)/g,'');
      return {text:text,callouts:callouts};
    }

    // Colour Capitalized identifiers as types, outside strings and comments.
    function markTypeNames(root){
      Array.prototype.slice.call(root.childNodes).forEach(function(n){
        if(n.nodeType===1){if(n.classList.contains('hljs-params'))markTypeNames(n);return;}
        if(n.nodeType!==3||!/[A-Z]/.test(n.nodeValue))return;
        var escaped=escapeHtml(n.nodeValue);
        var html=escaped.replace(/\b([A-Z][a-z0-9][A-Za-z0-9_]*)\b/g,'<span class="hljs-type">$1</span>');
        if(html===escaped)return;
        var holder=document.createElement('span');holder.innerHTML=html;
        while(holder.firstChild)n.parentNode.insertBefore(holder.firstChild,n);
        n.parentNode.removeChild(n);
      });
    }

    // Split highlighted HTML into lines. Spans that cross a line break are closed and re-opened.
    function splitLines(root){
      var lines=[''],stack=[];
      function opens(){return stack.map(function(t){return t.open;}).join('');}
      function closes(){return stack.slice().reverse().map(function(t){return t.close;}).join('');}
      (function walk(node){
        Array.prototype.forEach.call(node.childNodes,function(child){
          if(child.nodeType===3){
            child.nodeValue.split('\n').forEach(function(part,i){
              if(i>0)lines.push('');
              if(part)lines[lines.length-1]+=opens()+escapeHtml(part)+closes();
            });
          }else if(child.nodeType===1){
            var tag=child.tagName.toLowerCase();
            var attrs=Array.prototype.map.call(child.attributes,function(a){return ' '+a.name+'="'+escapeAttr(a.value)+'"';}).join('');
            var entry={open:'<'+tag+attrs+'>',close:'</'+tag+'>'};
            if(!child.childNodes.length){lines[lines.length-1]+=opens()+entry.open+entry.close+closes();return;}
            stack.push(entry);walk(child);stack.pop();
          }
        });
      })(root);
      if(lines.length>1&&lines[lines.length-1]==='')lines.pop();
      return lines;
    }

    function render(s,lines){
      s.code.innerHTML=lines.map(function(html,i){
        var n=i+1;
        return '<span class="code-line'+(s.hl[n]?' is-highlighted':'')+'"'+(s.numbered?' data-line="'+n+'"':'')+'>'+
          html+(s.callouts[n]?s.callouts[n].join(''):'')+'\n</span>';
      }).join('');
    }

    function copyText(text){
      function fallback(){
        return new Promise(function(resolve,reject){
          var ta=document.createElement('textarea');
          ta.value=text;ta.setAttribute('readonly','');ta.setAttribute('aria-hidden','true');
          ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
          document.body.appendChild(ta);ta.select();
          var ok=false;try{ok=document.execCommand('copy');}catch(e){}
          document.body.removeChild(ta);
          ok?resolve():reject(new Error('copy failed'));
        });
      }
      if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text).catch(fallback);
      return fallback();
    }

    function openInNewTab(s){
      var w=window.open('','_blank');
      if(!w)return;
      try{w.opener=null;}catch(e){}
      var d=w.document;
      d.open();
      d.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title>'+
        '<style>html{color-scheme:dark}body{margin:0;background:#1c2531;color:#e6edf3}'+
        'pre{margin:0;padding:24px;font:14px/1.7 "JetBrains Mono","Cascadia Code",Consolas,"SFMono-Regular",Menlo,monospace;white-space:pre;tab-size:4}</style>'+
        '</head><body><pre></pre></body></html>');
      d.close();
      d.title=s.label+' code · '+document.title;
      d.querySelector('pre').textContent=s.text;
    }

    function button(cls,icon,text,label){
      var b=document.createElement('button');
      b.type='button';b.className='code-btn '+cls;b.setAttribute('aria-label',label);
      b.innerHTML=icon+'<span class="code-btn-text">'+text+'</span>';
      return b;
    }

    function buildToolbar(s){
      var bar=document.createElement('div');bar.className='code-toolbar';
      var lang=document.createElement('span');lang.className='code-lang';lang.textContent=s.label;
      var actions=document.createElement('div');actions.className='code-actions';
      var status=document.createElement('span');status.className='code-status';status.setAttribute('role','status');
      var copy=button('code-copy',ICON_COPY,'Copy','Copy '+s.label+' code');
      var open=button('code-open',ICON_OPEN,'Open','Open '+s.label+' code in a new tab');
      var timer;
      copy.addEventListener('click',function(){
        copyText(s.text).then(function(){
          copy.classList.add('is-copied');
          copy.innerHTML=ICON_DONE+'<span class="code-btn-text">Copied</span>';
          status.textContent='Code copied to clipboard';
        },function(){
          // Clipboard blocked: select the code so the reader can press Ctrl+C / Cmd+C.
          var range=document.createRange();range.selectNodeContents(s.code);
          var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
          status.textContent='Could not copy automatically. The code is selected, press Ctrl+C to copy.';
        }).then(function(){
          copy.focus({preventScroll:true});
          clearTimeout(timer);
          timer=setTimeout(function(){
            copy.classList.remove('is-copied');
            copy.innerHTML=ICON_COPY+'<span class="code-btn-text">Copy</span>';
            status.textContent='';
          },2000);
        });
      });
      open.addEventListener('click',function(){openInNewTab(s);});
      actions.appendChild(copy);actions.appendChild(open);
      bar.appendChild(lang);bar.appendChild(actions);bar.appendChild(status);
      return bar;
    }

    function highlight(hljs,states){
      states.forEach(function(s){
        if(!hljs||!s.lang||!hljs.getLanguage(s.lang)||!s.code.isConnected)return;
        var tmp=document.createElement('div');
        try{tmp.innerHTML=hljs.highlight(s.text,{language:s.lang,ignoreIllegals:true}).value;}catch(e){return;}
        var canon=(hljs.getLanguage(s.lang).aliases||[]).concat([s.lang]);
        if(TYPE_CASE_LANGS[s.lang]||canon.some(function(a){return TYPE_CASE_LANGS[a];}))markTypeNames(tmp);
        render(s,splitLines(tmp));
      });
    }

    // The highlighter is loaded at most once per visit, then reused on every page.
    var highlighterPromise=null;
    function loadHighlighter(){
      if(window.hljs)return Promise.resolve(window.hljs);
      if(!siteScriptSrc)return Promise.resolve(null);
      if(!highlighterPromise){
        highlighterPromise=new Promise(function(resolve){
          var script=document.createElement('script');
          script.src=new URL('vendor/highlight.min.js?v=11.12.0',siteScriptSrc).href;
          script.async=true;
          script.onload=function(){resolve(window.hljs||null);};
          script.onerror=function(){highlighterPromise=null;resolve(null);};
          document.head.appendChild(script);
        });
      }
      return highlighterPromise;
    }

    return function(root){
      var pres=Array.prototype.slice.call(root.querySelectorAll('.article-body .listingblock > .content > pre:not(.code-pre)'));
      if(!pres.length)return;
      var states=pres.map(function(pre){
        var block=pre.closest('.listingblock');
        var code=pre.querySelector(':scope > code')||pre;
        var lang=(code.getAttribute('data-lang')||'').toLowerCase();
        var read=readCode(code);
        var s={pre:pre,code:code,lang:lang,text:read.text,callouts:read.callouts,hl:{},
          label:LANG_NAMES[lang]||(lang?lang.charAt(0).toUpperCase()+lang.slice(1):'Text')};
        (block.className.match(/\bhl-\d+(?:-\d+)?\b/g)||[]).forEach(function(role){
          var m=role.match(/hl-(\d+)(?:-(\d+))?/),from=+m[1],to=m[2]?+m[2]:from;
          for(var n=from;n<=to;n++)s.hl[n]=true;
        });
        var plain=s.text.split('\n');
        if(plain.length>1&&plain[plain.length-1]==='')plain.pop();
        s.numbered=plain.length>1&&!block.classList.contains('no-linenums');
        pre.classList.add('code-pre');
        if(s.numbered){pre.classList.add('code-numbered');pre.style.setProperty('--ln-digits',String(String(plain.length).length));}
        pre.parentNode.classList.add('code-card');
        pre.parentNode.insertBefore(buildToolbar(s),pre);
        render(s,plain.map(escapeHtml));
        return s;
      });
      var needsHighlighter=states.some(function(s){return s.lang&&s.lang!=='text'&&s.lang!=='txt'&&s.lang!=='plaintext';});
      if(!needsHighlighter)return;
      if(window.hljs){highlight(window.hljs,states);return;}
      loadHighlighter().then(function(hljs){if(hljs)highlight(hljs,states);});
    };
  })();

  // v19: coding articles collapse their solution behind an AsciiDoc [%collapsible] block.
  // The article only supplies the block title; the language label and line count are read
  // back off the code itself so authors never hand-maintain them.
  function enhanceCollapsibleCode(root){
    var LANG_LABELS={java:'Java',javascript:'JavaScript',js:'JavaScript',typescript:'TypeScript',ts:'TypeScript',
      python:'Python',py:'Python',sql:'SQL',bash:'Bash',shell:'Shell',sh:'Shell',yaml:'YAML',yml:'YAML',
      json:'JSON',xml:'XML',html:'HTML',css:'CSS',go:'Go',rust:'Rust',kotlin:'Kotlin',c:'C',cpp:'C++',csharp:'C#'};
    var blocks=root.querySelectorAll('.article-body.coding-page details');
    Array.prototype.forEach.call(blocks,function(details){
      var summary=details.querySelector(':scope > summary');
      if(!summary||summary.querySelector('.cp-code-meta'))return;
      var code=details.querySelector('.listingblock code');
      if(!code)return;

      var meta=document.createElement('span');
      meta.className='cp-code-meta';

      var lang=(code.getAttribute('data-lang')||'').toLowerCase();
      if(lang){
        var label=document.createElement('span');
        label.className='cp-code-lang';
        label.textContent=LANG_LABELS[lang]||lang.charAt(0).toUpperCase()+lang.slice(1);
        meta.appendChild(label);
      }

      // textContent is read after enhanceCode() has already split the block into
      // .code-line elements, so fall back to counting those when present.
      var lineEls=code.querySelectorAll('.code-line');
      var count=lineEls.length;
      if(!count){
        var text=(code.textContent||'').replace(/\n+$/,'');
        count=text?text.split('\n').length:0;
      }
      if(count){
        var lines=document.createElement('span');
        lines.className='cp-code-lines';
        lines.textContent='~ '+count+' lines';
        meta.appendChild(lines);
      }

      if(meta.childNodes.length)summary.appendChild(meta);
    });
  }

  // Everything inside the article that needs JavaScript. Runs on first load and after every in-place page change.
  function enhanceContent(root){
    enhanceImages(root);
    buildToc();
    enhanceCode(root);
    // After enhanceCode so the line count can use its rendered .code-line elements.
    enhanceCollapsibleCode(root);
  }
  enhanceContent(document);

  // v12: single-page navigation. Links between documentation pages download the next page
  // in the background and swap only the article and "On this page" panel, so the header,
  // sidebar (open groups, filter text, scroll position) stay put and the page never flashes.
  // The address bar, tab title, Back/Forward, reload and shared links behave as before.
  // Anything unusual falls back to a normal page load: other sites, new-tab clicks, files,
  // a page with a different layout or sidebar, a missing page, or a network error.
  // Opening the HTML files straight from disk (file://) always uses normal page loads.
  (function(){
    var main=document.getElementById('article-main');
    var tocPanel=document.querySelector('.docs-toc');
    if(!/^https?:$/.test(location.protocol)||!main||!tocPanel||!sidebar||!docNav)return;
    if(!document.body.classList.contains('docs-page'))return;
    if(!(window.history&&history.pushState&&window.fetch&&window.DOMParser&&window.Promise))return;
    var stylesheet=document.querySelector('link[rel="stylesheet"][href*="/css/site.css"]');
    var assetUrl=stylesheet?stylesheet.href:siteScriptSrc;
    if(!assetUrl)return;
    // UI files live in <site root>/_/css/ and <site root>/_/js/.
    var siteRoot=new URL('../../',assetUrl).href;
    var uiRoot=new URL('../',assetUrl).href;

    // Relative links in the header, sidebar and footer would point to the wrong place once
    // the address changes to a page in another folder, so make them absolute once.
    var URL_ATTRS={a:['href'],area:['href'],img:['src','srcset'],source:['src','srcset'],video:['src','poster'],audio:['src'],
      track:['src'],iframe:['src'],embed:['src'],object:['data'],form:['action']};
    var HAS_SCHEME=/^(?:[a-z][a-z\d+.\-]*:|\/\/)/i;
    function absoluteUrl(value,base){
      if(!value||value.charAt(0)==='#'||HAS_SCHEME.test(value))return value;
      try{return new URL(value,base).href;}catch(e){return value;}
    }
    function absolutize(root,base){
      Object.keys(URL_ATTRS).forEach(function(tag){
        URL_ATTRS[tag].forEach(function(attr){
          root.querySelectorAll(tag+'['+attr+']').forEach(function(el){
            var value=el.getAttribute(attr);
            var fixed=attr==='srcset'
              ?value.split(',').map(function(part){var bits=part.trim().split(/\s+/);bits[0]=absoluteUrl(bits[0],base);return bits.join(' ');}).join(', ')
              :absoluteUrl(value,base);
            if(fixed!==value)el.setAttribute(attr,fixed);
          });
        });
      });
    }
    [header,sidebar,document.querySelector('.docs-footer')].forEach(function(el){if(el)absolutize(el,location.href);});

    // Live region so screen readers hear that a new page loaded, and a thin progress bar for slow loads.
    var announcer=document.createElement('div');
    announcer.className='spa-announcer';
    announcer.setAttribute('aria-live','polite');
    announcer.setAttribute('aria-atomic','true');
    document.body.appendChild(announcer);
    // Top progress bar: starts quickly, slows as it approaches the end while the page is
    // still loading (it never promises to reach 100% on its own), then on success jumps
    // straight to 100% and fades out. A failed/aborted load resets it instantly, unhidden.
    var progress=document.createElement('div');
    progress.className='spa-progress';
    progress.setAttribute('aria-hidden','true');
    document.body.appendChild(progress);
    var progressPct=0,progressTrickle=null,progressShowDelay=null,progressHideTimer=null;
    function setProgress(pct,animated){
      progressPct=pct;
      progress.style.transition=animated===false?'none':'';
      progress.style.transform='scaleX('+(pct/100)+')';
      if(animated===false)progress.getBoundingClientRect();
    }
    function startProgress(){
      clearTimeout(progressShowDelay);clearInterval(progressTrickle);clearTimeout(progressHideTimer);
      progress.classList.remove('is-done');
      setProgress(0,false);
      // A fast page doesn't need the bar to appear at all.
      progressShowDelay=setTimeout(function(){
        progress.classList.add('is-visible');
        setProgress(18);
        progressTrickle=setInterval(function(){setProgress(progressPct+(90-progressPct)*0.08);},180);
      },150);
    }
    function finishProgress(){
      clearTimeout(progressShowDelay);clearInterval(progressTrickle);
      if(!progress.classList.contains('is-visible'))return;
      progress.classList.add('is-done');
      setProgress(100);
      progressHideTimer=setTimeout(function(){progress.classList.remove('is-visible','is-done');setProgress(0,false);},550);
    }
    function cancelProgress(){
      clearTimeout(progressShowDelay);clearInterval(progressTrickle);clearTimeout(progressHideTimer);
      progress.classList.remove('is-visible','is-done');
      setProgress(0,false);
    }

    function pageKey(href){var u=new URL(href,location.href);return u.origin+u.pathname+u.search;}
    var currentKey=pageKey(location.href);

    // Scroll positions per history entry. Saved in history.state so they also survive a reload.
    var entrySeq=0;
    function newEntryId(){return Date.now().toString(36)+'-'+(++entrySeq);}
    var scrollMemory={};
    function stateCopy(){
      var st=history.state,copy={};
      if(st&&typeof st==='object')for(var k in st)if(Object.prototype.hasOwnProperty.call(st,k))copy[k]=st[k];
      return copy;
    }
    function ensureEntryId(){
      var st=stateCopy();
      if(!st.spaId){st.spaId=newEntryId();try{history.replaceState(st,'');}catch(e){}}
      return st.spaId;
    }
    var currentEntry=ensureEntryId();
    // Browsers ignore history changes made while a page unloads, so a reload reads the position from sessionStorage.
    var STORE_PREFIX='spa-scroll:';
    function storeScroll(id,y){try{sessionStorage.setItem(STORE_PREFIX+id,String(Math.round(y)));}catch(e){}}
    function storedScroll(id){try{var v=sessionStorage.getItem(STORE_PREFIX+id);return v===null?undefined:Number(v);}catch(e){return undefined;}}
    function saveScroll(){
      scrollMemory[currentEntry]=window.scrollY;
      storeScroll(currentEntry,window.scrollY);
      var st=stateCopy();
      st.spaId=currentEntry; st.spaScrollY=window.scrollY;
      try{history.replaceState(st,'');}catch(e){}
    }
    function scrollInstantly(fn){
      var root=document.documentElement,previous=root.style.scrollBehavior;
      root.style.scrollBehavior='auto';
      try{fn();}finally{root.style.scrollBehavior=previous;}
    }
    function scrollToHash(hash){
      if(!hash||hash.length<2)return false;
      var id;try{id=decodeURIComponent(hash.slice(1));}catch(e){id=hash.slice(1);}
      var el=document.getElementById(id)||document.getElementsByName(id)[0];
      if(!el)return false;
      el.scrollIntoView();
      return true;
    }

    // The browser would otherwise jump to an old scroll position before the new page is in place.
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    window.addEventListener('pagehide',function(){storeScroll(currentEntry,window.scrollY);});
    // Reload / returning from another site: put the reader back where they were.
    (function(){
      var nav=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
      var type=nav&&nav.type;
      var y=storedScroll(currentEntry);
      if(typeof y!=='number'||isNaN(y))y=history.state&&history.state.spaScrollY;
      if((type!=='reload'&&type!=='back_forward')||typeof y!=='number')return;
      var restore=function(){scrollInstantly(function(){window.scrollTo(0,y);});};
      restore();
      var userScrolled=false;
      var mark=function(){userScrolled=true;};
      ['wheel','touchstart','keydown'].forEach(function(n){window.addEventListener(n,mark,{once:true,passive:true});});
      window.addEventListener('load',function(){if(!userScrolled&&Math.abs(window.scrollY-y)>2)restore();},{once:true});
    })();

    // Which links are handled in place.
    function inPlaceUrl(a){
      if(!(a instanceof HTMLAnchorElement))return null;
      if(a.hasAttribute('download'))return null;
      var target=a.getAttribute('target');
      if(target&&target!=='_self')return null;
      if(/(?:^|\s)external(?:\s|$)/.test(a.getAttribute('rel')||''))return null;
      if(!a.getAttribute('href'))return null;
      var url;try{url=new URL(a.href);}catch(e){return null;}
      if(url.origin!==location.origin)return null;
      if(url.href.indexOf(siteRoot)!==0||url.href.indexOf(uiRoot)===0)return null;
      if(!/(?:\.html|\/)$/.test(url.pathname))return null;
      return url;
    }

    // Downloaded pages are kept for the visit, so going back or hovering twice costs nothing.
    var pageCache={},cacheOrder=[];
    function fetchPage(href,signal){
      var key=href.split('#')[0];
      if(pageCache[key])return pageCache[key];
      var request=fetch(key,{credentials:'same-origin',signal:signal,headers:{Accept:'text/html'}}).then(function(res){
        var type=res.headers.get('content-type')||'';
        if(!res.ok||type.indexOf('text/html')<0)throw new Error('Not a page');
        return res.text().then(function(html){return {url:res.url||key,html:html};});
      });
      pageCache[key]=request; cacheOrder.push(key);
      if(cacheOrder.length>40)delete pageCache[cacheOrder.shift()];
      request.catch(function(){if(pageCache[key]===request)delete pageCache[key];});
      return request;
    }

    function importInto(target,source){
      var fragment=document.createDocumentFragment();
      Array.prototype.forEach.call(source.childNodes,function(node){fragment.appendChild(document.importNode(node,true));});
      while(target.firstChild)target.removeChild(target.firstChild);
      target.appendChild(fragment);
    }

    function revealCurrentInSidebar(){
      var current=docNav.querySelector('a[aria-current="page"]');
      if(!current)return;
      for(var group=current.closest('.nav-group');group;group=group.parentElement&&group.parentElement.closest('.nav-group'))setGroupOpen(group,true);
      if(phoneMQ.matches||docNav.scrollHeight<=docNav.clientHeight)return;
      var box=docNav.getBoundingClientRect(),link=current.getBoundingClientRect();
      if(link.top<box.top)docNav.scrollTop-=box.top-link.top+12;
      else if(link.bottom>box.bottom)docNav.scrollTop+=link.bottom-box.bottom+12;
    }

    function focusNewPage(){
      var heading=main.querySelector('h1')||main.querySelector('.article-body h2')||main;
      if(!heading.hasAttribute('tabindex'))heading.setAttribute('tabindex','-1');
      heading.setAttribute('data-spa-focus','');
      try{heading.focus({preventScroll:true});}catch(e){heading.focus();}
    }
    function announce(text){
      announcer.textContent='';
      setTimeout(function(){announcer.textContent=text;},60);
    }

    function swapIn(doc,newMain,newToc){
      document.title=doc.title;
      var description=document.querySelector('meta[name="description"]');
      var newDescription=doc.querySelector('meta[name="description"]');
      if(newDescription){
        if(!description){description=document.createElement('meta');description.setAttribute('name','description');document.head.appendChild(description);}
        description.setAttribute('content',newDescription.getAttribute('content')||'');
      }else if(description){description.parentNode.removeChild(description);}
      main.className=newMain.className;
      importInto(main,newMain);
      tocPanel.className=newToc.className;
      importInto(tocPanel,newToc);
      currentKey=pageKey(location.href);
      markCurrent();
      revealCurrentInSidebar();
      enhanceContent(main);
    }

    var navToken=0,activeRequest=null;
    function setLoading(state){
      // state: 'start' | 'done' | 'cancel'
      if(state==='start'){startProgress();main.setAttribute('aria-busy','true');}
      else{
        main.removeAttribute('aria-busy');
        if(state==='done')finishProgress();else cancelProgress();
      }
    }

    function navigate(href,options){
      var token=++navToken;
      if(activeRequest){try{activeRequest.abort();}catch(e){}}
      activeRequest=window.AbortController?new AbortController():null;
      var requested=new URL(href,location.href);
      var pushed=false;
      setLoading('start');
      return fetchPage(requested.href,activeRequest&&activeRequest.signal).then(function(page){
        if(token!==navToken)return;
        var finalUrl=new URL(page.url,requested.href);
        if(!finalUrl.hash&&requested.hash)finalUrl.hash=requested.hash;
        var doc=new DOMParser().parseFromString(page.html,'text/html');
        var newMain=doc.getElementById('article-main');
        var newToc=doc.querySelector('.docs-toc');
        if(!doc.body||!doc.body.classList.contains('docs-page')||!newMain||!newToc)throw new Error('Different layout');
        if(navSignature(doc.querySelector('.docs-sidebar nav[aria-label="Documentation pages"]'),finalUrl.href)!==initialNavSignature)throw new Error('Different sidebar');
        absolutize(doc,finalUrl.href);
        if(options.push){
          saveScroll();
          currentEntry=newEntryId();
          history.pushState({spaId:currentEntry},'',finalUrl.href);
          pushed=true;
        }
        swapIn(doc,newMain,newToc);
        scrollInstantly(function(){
          if(typeof options.scrollY==='number')window.scrollTo(0,options.scrollY);
          else if(!scrollToHash(finalUrl.hash))window.scrollTo(0,0);
        });
        focusNewPage();
        announce(doc.title);
        setLoading('done');
      }).catch(function(error){
        if(token!==navToken)return;
        if(error&&error.name==='AbortError'){setLoading('cancel');return;}
        setLoading('cancel');
        // Anything unexpected: do a normal page load of the same address.
        if(pushed)location.replace(requested.href);
        else if(options.push)location.assign(requested.href);
        else location.reload();
      });
    }

    var ignoreNextPop=false;
    document.addEventListener('click',function(event){
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      var link=event.target.closest&&event.target.closest('a[href]');
      if(!link)return;
      var url=inPlaceUrl(link);
      if(!url)return;
      if(pageKey(url.href)===currentKey){
        if(url.hash){
          // Same-page anchor: let the browser jump as usual, but remember where we were for Back.
          if(url.href!==location.href){
            saveScroll();
            ignoreNextPop=true;
            setTimeout(function(){
              ignoreNextPop=false;
              currentEntry=newEntryId();
              var st=stateCopy();st.spaId=currentEntry;delete st.spaScrollY;
              try{history.replaceState(st,'');}catch(e){}
            },0);
          }
          return;
        }
        // Link to the page already shown: go to the top instead of reloading.
        event.preventDefault();
        window.scrollTo({top:0,behavior:'smooth'});
        return;
      }
      event.preventDefault();
      navigate(url.href,{push:true});
    });

    window.addEventListener('popstate',function(event){
      if(ignoreNextPop){ignoreNextPop=false;return;}
      scrollMemory[currentEntry]=window.scrollY;
      var st=event.state&&typeof event.state==='object'?event.state:{};
      if(!st.spaId){currentEntry=ensureEntryId();}else{currentEntry=st.spaId;}
      var y=typeof scrollMemory[currentEntry]==='number'?scrollMemory[currentEntry]:storedScroll(currentEntry);
      if(typeof y!=='number'||isNaN(y))y=typeof st.spaScrollY==='number'?st.spaScrollY:undefined;
      closeDrawer();
      if(pageKey(location.href)===currentKey){
        // Back/Forward between anchors on the same page.
        scrollInstantly(function(){
          if(typeof y==='number')window.scrollTo(0,y);
          else if(!scrollToHash(location.hash))window.scrollTo(0,0);
        });
        return;
      }
      navigate(location.href,{push:false,scrollY:y});
    });

    // Start downloading a page as soon as the pointer rests on its link (or a finger touches it).
    function canPrefetch(){
      var c=navigator.connection;
      return !(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||'')));
    }
    function prefetchLink(target){
      var link=target&&target.closest&&target.closest('a[href]');
      if(!link)return;
      var url=inPlaceUrl(link);
      if(!url||pageKey(url.href)===currentKey||!canPrefetch())return;
      fetchPage(url.href).catch(function(){});
    }
    var hoverTimer=null;
    document.addEventListener('mouseover',function(event){
      clearTimeout(hoverTimer);
      var target=event.target;
      hoverTimer=setTimeout(function(){prefetchLink(target);},65);
    });
    document.addEventListener('touchstart',function(event){prefetchLink(event.target);},{passive:true});
    document.addEventListener('focusin',function(event){prefetchLink(event.target);});
  })();
})();

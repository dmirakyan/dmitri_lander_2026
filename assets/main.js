(function() {
	function getScrollOffset() {
		var sidebar = document.querySelector('.sidebar');
		if (!sidebar) {
			return 0;
		}

		if (window.innerWidth >= 768) {
			return 24;
		}

		return sidebar.offsetHeight + 12;
	}

	function createFootnotePopover() {
		var popover = document.createElement('div');
		popover.className = 'footnote-popover';
		popover.setAttribute('hidden', '');
		popover.innerHTML = '<button class="footnote-popover-close" type="button" aria-label="Close footnote">×</button><div class="footnote-popover-content"></div>';
		document.body.appendChild(popover);
		return popover;
	}

	function positionFootnotePopover(popover, trigger) {
		var rect = trigger.getBoundingClientRect();
		var popoverRect = popover.getBoundingClientRect();
		var gap = 10;
		var top = rect.bottom + gap;
		var left = rect.left + (rect.width / 2) - (popoverRect.width / 2);

		if (left < 12) {
			left = 12;
		}

		if (left + popoverRect.width > window.innerWidth - 12) {
			left = window.innerWidth - popoverRect.width - 12;
		}

		if (top + popoverRect.height > window.innerHeight - 12) {
			top = rect.top - popoverRect.height - gap;
		}

		if (top < 12) {
			top = 12;
		}

		popover.style.top = top + 'px';
		popover.style.left = left + 'px';
	}

	function initializeFootnotes() {
		var refs = Array.prototype.slice.call(document.querySelectorAll('.post-body .footnote-trigger[data-footnote]'));
		if (!refs.length) {
			return;
		}

		var popover = createFootnotePopover();
		var closeButton = popover.querySelector('.footnote-popover-close');
		var content = popover.querySelector('.footnote-popover-content');
		var activeTrigger = null;

		function closePopover() {
			popover.setAttribute('hidden', '');
			popover.classList.remove('is-visible');
			content.innerHTML = '';
			if (activeTrigger) {
				activeTrigger.setAttribute('aria-expanded', 'false');
			}
			activeTrigger = null;
		}

		function getFootnoteContent(target) {
			var fragment = document.createDocumentFragment();
			var node = target.cloneNode(true);
			var backLink = node.querySelector('.footnote-back');
			if (backLink) {
				backLink.remove();
			}
			fragment.appendChild(node);

			var sibling = target.nextElementSibling;
			while (sibling && !sibling.classList.contains('footnote')) {
				fragment.appendChild(sibling.cloneNode(true));
				sibling = sibling.nextElementSibling;
			}

			return fragment;
		}

		function openPopover(trigger, target) {
			content.innerHTML = '';
			content.appendChild(getFootnoteContent(target));
			popover.removeAttribute('hidden');
			popover.classList.add('is-visible');
			activeTrigger = trigger;
			trigger.setAttribute('aria-expanded', 'true');
			positionFootnotePopover(popover, trigger);
		}

		refs.forEach(function(trigger) {
			trigger.setAttribute('aria-haspopup', 'dialog');
			trigger.setAttribute('aria-expanded', 'false');

			trigger.addEventListener('click', function() {
				var target = document.getElementById(trigger.getAttribute('data-footnote'));
				if (!target) {
					return;
				}

				if (activeTrigger === trigger) {
					closePopover();
					return;
				}

				if (activeTrigger) {
					activeTrigger.setAttribute('aria-expanded', 'false');
				}

				openPopover(trigger, target);
			});
		});

		closeButton.addEventListener('click', closePopover);

		document.addEventListener('click', function(event) {
			if (!activeTrigger) {
				return;
			}

			if (popover.contains(event.target) || activeTrigger.contains(event.target)) {
				return;
			}

			closePopover();
		});

		document.addEventListener('keydown', function(event) {
			if (event.key === 'Escape' && activeTrigger) {
				closePopover();
			}
		});

		window.addEventListener('resize', function() {
			if (activeTrigger) {
				positionFootnotePopover(popover, activeTrigger);
			}
		});

		window.addEventListener('scroll', function() {
			if (activeTrigger) {
				positionFootnotePopover(popover, activeTrigger);
			}
		}, { passive: true });
	}

	document.querySelectorAll('.site-nav a[href^="#"]').forEach(function(link) {
		link.addEventListener('click', function(event) {
			var target = document.querySelector(this.getAttribute('href'));
			if (!target) {
				return;
			}

			event.preventDefault();

			var top = target.getBoundingClientRect().top + window.pageYOffset - getScrollOffset();
			window.scrollTo({
				top: top,
				behavior: 'smooth'
			});
		});
	});

	initializeFootnotes();
})();

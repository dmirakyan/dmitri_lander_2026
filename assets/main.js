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
})();

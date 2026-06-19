let currentUser = null;
let boardMap = {};

document.addEventListener('DOMContentLoaded', function() {
	initAdmin();
});

async function initAdmin() {
	bindEvents();
	await checkSession();
}

function bindEvents() {
	const loginForm = document.getElementById('loginForm');
	const logoutBtn = document.getElementById('logoutBtn');
	const postForm = document.getElementById('postForm');
	const profileForm = document.getElementById('profileForm');
	const resetPostBtn = document.getElementById('resetPostBtn');
	const filterBoardCode = document.getElementById('filterBoardCode');
	const boardCode = document.getElementById('boardCode');

	if (loginForm) { loginForm.addEventListener('submit', handleLogin); }
	if (logoutBtn) { logoutBtn.addEventListener('click', handleLogout); }
	if (postForm) { postForm.addEventListener('submit', handleSavePost); }
	if (profileForm) { profileForm.addEventListener('submit', handleSaveProfile); }
	if (resetPostBtn) { resetPostBtn.addEventListener('click', resetPostForm); }
	if (filterBoardCode) { filterBoardCode.addEventListener('change', loadPosts); }
	if (boardCode) { boardCode.addEventListener('change', updatePostFormGuide); updatePostFormGuide(); }
}

async function checkSession() {
	showLoading();

	const { data, error } = await db.auth.getSession();

	if (error) {
		console.error('세션 확인 오류:', error);
		hideLoading();
		showLogin();
		return;
	}

	if (data && data.session && data.session.user) {
		currentUser = data.session.user;
		await showAdmin();
	} else {
		showLogin();
	}

	hideLoading();
}

async function handleLogin(event) {
	event.preventDefault();

	const email = document.getElementById('loginEmail').value.trim();
	const password = document.getElementById('loginPassword').value.trim();

	if (!email || !password) {
		showMessage('loginMessage', '이메일과 비밀번호를 입력하세요.');
		return;
	}

	showLoading();

	const { data, error } = await db.auth.signInWithPassword({ email: email, password: password });

	if (error) {
		hideLoading();
		showMessage('loginMessage', '로그인에 실패했습니다.');
		console.error('로그인 오류:', error);
		return;
	}

	currentUser = data.user;
	await showAdmin();
	hideLoading();
}

async function handleLogout() {
	showLoading();
	await db.auth.signOut();
	currentUser = null;
	boardMap = {};
	resetPostForm();
	showLogin();
	hideLoading();
}

async function showAdmin() {
	const loginBox = document.getElementById('loginBox');
	const adminArea = document.getElementById('adminArea');
	const logoutBtn = document.getElementById('logoutBtn');

	if (loginBox) { loginBox.style.display = 'none'; }
	if (adminArea) { adminArea.style.display = 'block'; }
	if (logoutBtn) { logoutBtn.style.display = 'inline-flex'; }

	await loadBoards();
	await loadProfile();
	await loadPosts();
}

function showLogin() {
	const loginBox = document.getElementById('loginBox');
	const adminArea = document.getElementById('adminArea');
	const logoutBtn = document.getElementById('logoutBtn');

	if (loginBox) { loginBox.style.display = 'block'; }
	if (adminArea) { adminArea.style.display = 'none'; }
	if (logoutBtn) { logoutBtn.style.display = 'none'; }
}

async function loadBoards() {
	const { data, error } = await db
		.from('boards')
		.select('id, board_code, board_name, board_type, is_visible')
		.order('sort_order', { ascending: true });

	if (error) {
		console.error('게시판 조회 오류:', error);
		return;
	}

	boardMap = {};

	(data || []).forEach(function(board) {
		boardMap[board.board_code] = board;
	});
}

async function loadPosts() {
	const postList = document.getElementById('postList');
	const filterBoardCode = document.getElementById('filterBoardCode');
	const boardCode = document.getElementById('boardCode');
	const selectedBoardCode = filterBoardCode ? filterBoardCode.value : '';

	if (!postList) { return; }

	postList.innerHTML = '';

	let query = db
		.from('posts')
		.select(`
			id,
			board_id,
			title,
			caption,
			description,
			thumbnail_url,
			sort_order,
			is_visible,
			is_featured,
			category_code,
			created_at,
			updated_at,
			boards ( id, board_code, board_name, board_type ),
			post_items ( id, item_type, image_url, video_url, youtube_id, caption, description, sort_order, is_visible )
		`)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: false });

	if (selectedBoardCode && boardMap[selectedBoardCode]) {
		query = query.eq('board_id', boardMap[selectedBoardCode].id);
	}

	const { data, error } = await query;

	if (error) {
		console.error('게시글 목록 조회 오류:', error);
		return;
	}

	(data || []).forEach(function(post) {
		post.post_items = (post.post_items || []).sort(function(a, b) {
			return (a.sort_order || 0) - (b.sort_order || 0);
		});

		postList.insertAdjacentHTML('beforeend', getPostCardHtml(post));
	});

	bindPostCardEvents();
}

function getPostCardHtml(post) {
	const boardName = post.boards ? post.boards.board_name : '';
	const boardCode = post.boards ? post.boards.board_code : '';
	const categoryName = getCategoryName(post.category_code);
	const itemCount = post.post_items ? post.post_items.length : 0;

	return `
		<article class="post-card" data-post-id="${post.id}">
			<h3 class="post-title">${escapeHtml(post.title || '')}</h3>
			<p class="post-meta">${escapeHtml(boardName)} / ${escapeHtml(categoryName)} / 항목 ${itemCount}개</p>
			<p class="post-meta">ID ${post.id} / ${escapeHtml(boardCode)} / 정렬 ${post.sort_order || 0} / ${post.is_visible ? '노출' : '숨김'} / ${post.is_featured ? '메인 대표' : '일반'}</p>
			<div class="post-actions">
				<button type="button" class="small-btn edit-post-btn" data-post-id="${post.id}">수정</button>
				<a href="detail.html?id=${post.id}" target="_blank" class="small-btn">보기</a>
				<button type="button" class="small-btn danger delete-post-btn" data-post-id="${post.id}">삭제</button>
			</div>
		</article>
	`;
}

function bindPostCardEvents() {
	document.querySelectorAll('.edit-post-btn').forEach(function(button) {
		button.addEventListener('click', function() {
			loadPostForEdit(this.dataset.postId);
		});
	});

	document.querySelectorAll('.delete-post-btn').forEach(function(button) {
		button.addEventListener('click', function() {
			deletePost(this.dataset.postId);
		});
	});
}

async function loadPostForEdit(postId) {
	showLoading();

	const { data, error } = await db
		.from('posts')
		.select(`
			id,
			board_id,
			title,
			caption,
			description,
			thumbnail_url,
			sort_order,
			is_visible,
			is_featured,
			category_code,
			boards ( id, board_code, board_name ),
			post_items ( id, item_type, image_url, video_url, youtube_id, caption, description, sort_order, is_visible )
		`)
		.eq('id', postId)
		.maybeSingle();

	hideLoading();

	if (error || !data) {
		console.error('게시글 수정 조회 오류:', error);
		return;
	}

	const items = (data.post_items || []).sort(function(a, b) {
		return (a.sort_order || 0) - (b.sort_order || 0);
	});

	setValue('postId', data.id);
	setValue('boardCode', data.boards ? data.boards.board_code : '');
	updatePostFormGuide();
	setValue('categoryCode', data.category_code || 'performance');
	setValue('postTitle', data.title || '');
	setValue('postCaption', data.caption || '');
	setValue('postDescription', data.description || '');
	setValue('thumbnailUrl', data.thumbnail_url || '');
	setValue('sortOrder', data.sort_order || 0);
	setValue('isVisible', String(data.is_visible === true));
	setValue('isFeatured', String(data.is_featured === true));
	setValue('itemUrls', items.map(function(item) { return item.item_type === 'video' ? item.video_url || '' : item.image_url || ''; }).join('\n'));
	setValue('itemCaptions', items.map(function(item) { return item.caption || ''; }).join('\n'));
	setValue('itemDescriptions', items.map(function(item) { return item.description || ''; }).join('\n'));

	window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleSavePost(event) {
	event.preventDefault();

	const postId = getValue('postId');
	const boardCode = getValue('boardCode');
	const board = boardMap[boardCode];

	if (!board) {
		showMessage('adminMessage', '게시판 정보를 찾을 수 없습니다.');
		return;
	}

	const isVideoBoard = boardCode === 'VIDEO_ARCHIVE';

	const payload = {
		board_id: board.id,
		title: getValue('postTitle'),
		caption: getValue('postCaption') || null,
		description: getValue('postDescription') || null,
		thumbnail_url: isVideoBoard ? null : (getValue('thumbnailUrl') || null),
		sort_order: Number(getValue('sortOrder') || 0),
		is_visible: getValue('isVisible') === 'true',
		is_featured: getValue('isFeatured') === 'true',
		category_code: getValue('categoryCode'),
		updated_at: new Date().toISOString()
	};

	if (!payload.title) {
		showMessage('adminMessage', '제목을 입력하세요.');
		return;
	}

	showLoading();

	let savedPost = null;

	if (postId) {
		const { data, error } = await db.from('posts').update(payload).eq('id', postId).select('id').single();

		if (error) {
			hideLoading();
			console.error('게시글 수정 오류:', error);
			showMessage('adminMessage', '게시글 수정에 실패했습니다.');
			return;
		}

		savedPost = data;
		await deletePostItems(postId);
	} else {
		payload.created_by = currentUser ? currentUser.id : null;

		const { data, error } = await db.from('posts').insert(payload).select('id').single();

		if (error) {
			hideLoading();
			console.error('게시글 등록 오류:', error);
			showMessage('adminMessage', '게시글 등록에 실패했습니다.');
			return;
		}

		savedPost = data;
	}

	await insertPostItems(savedPost.id, boardCode);
	resetPostForm();
	await loadPosts();
	hideLoading();
	showMessage('adminMessage', '저장되었습니다.');
}

async function deletePostItems(postId) {
	const { error } = await db.from('post_items').delete().eq('post_id', postId);
	if (error) { console.error('기존 항목 삭제 오류:', error); }
}

async function insertPostItems(postId, boardCode) {
	const urls = getTextareaLines('itemUrls');
	const captions = getTextareaLines('itemCaptions');
	const descriptions = getTextareaLines('itemDescriptions');

	if (urls.length === 0) { return; }

	const isVideoBoard = boardCode === 'VIDEO_ARCHIVE';
	const items = urls.map(function(url, index) {
		const isYoutube = isYoutubeUrl(url);
		const itemType = isVideoBoard || isYoutube ? 'video' : 'image';
		const youtubeId = itemType === 'video' ? extractYoutubeId(url) : null;

		return {
			post_id: postId,
			item_type: itemType,
			image_url: itemType === 'image' ? url : null,
			video_url: itemType === 'video' ? url : null,
			youtube_id: youtubeId,
			caption: captions[index] || null,
			description: descriptions[index] || null,
			sort_order: index,
			is_visible: true,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};
	});

	const { error } = await db.from('post_items').insert(items);

	if (error) {
		console.error('게시글 항목 저장 오류:', error);
		showMessage('adminMessage', '게시글은 저장됐지만 항목 저장에 실패했습니다.');
	}
}

async function deletePost(postId) {
	if (!confirm('게시글을 삭제하시겠습니까?')) { return; }

	showLoading();
	await db.from('post_items').delete().eq('post_id', postId);
	const { error } = await db.from('posts').delete().eq('id', postId);
	hideLoading();

	if (error) {
		console.error('게시글 삭제 오류:', error);
		showMessage('adminMessage', '삭제에 실패했습니다.');
		return;
	}

	await loadPosts();
	showMessage('adminMessage', '삭제되었습니다.');
}

function resetPostForm() {
	const postForm = document.getElementById('postForm');
	if (postForm) { postForm.reset(); }
	setValue('postId', '');
	setValue('categoryCode', 'performance');
	setValue('sortOrder', 0);
	setValue('isVisible', 'true');
	setValue('isFeatured', 'false');
	updatePostFormGuide();
}

async function loadProfile() {
	const { data, error } = await db
		.from('site_profiles')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		console.error('작가 정보 조회 오류:', error);
		return;
	}

	if (!data) { return; }

	setValue('profileId', data.id || '');
	setValue('artistName', data.artist_name || '');
	setValue('artistTitle', data.artist_title || '');
	setValue('artistMessage', data.artist_message || '');
	setValue('email', data.email || '');
	setValue('instagramUrl', data.instagram_url || '');
	setValue('phone', data.phone || '');
	setValue('profileImageUrl', data.profile_image_url || '');
}

async function handleSaveProfile(event) {
	event.preventDefault();

	const profileId = getValue('profileId');
	const payload = {
		artist_name: getValue('artistName') || null,
		artist_title: getValue('artistTitle') || null,
		artist_message: getValue('artistMessage') || null,
		email: getValue('email') || null,
		instagram_url: getValue('instagramUrl') || null,
		phone: getValue('phone') || null,
		profile_image_url: getValue('profileImageUrl') || null,
		updated_at: new Date().toISOString()
	};

	showLoading();

	if (profileId) {
		const { error } = await db.from('site_profiles').update(payload).eq('id', profileId);
		hideLoading();

		if (error) {
			console.error('작가 정보 수정 오류:', error);
			showMessage('adminMessage', '작가 정보 저장에 실패했습니다.');
			return;
		}

		showMessage('adminMessage', '작가 정보가 저장되었습니다.');
		return;
	}

	payload.created_at = new Date().toISOString();

	const { data, error } = await db.from('site_profiles').insert(payload).select('id').single();
	hideLoading();

	if (error) {
		console.error('작가 정보 등록 오류:', error);
		showMessage('adminMessage', '작가 정보 저장에 실패했습니다.');
		return;
	}

	setValue('profileId', data.id);
	showMessage('adminMessage', '작가 정보가 저장되었습니다.');
}


function updatePostFormGuide() {
	const boardCode = document.getElementById('boardCode');
	const thumbnailRow = document.getElementById('thumbnailRow');
	const thumbnailUrl = document.getElementById('thumbnailUrl');
	const thumbnailHelp = document.getElementById('thumbnailHelp');
	const boardHelp = document.getElementById('boardHelp');
	const itemUrlsLabel = document.getElementById('itemUrlsLabel');
	const itemUrlsHelp = document.getElementById('itemUrlsHelp');

	if (!boardCode) {
		return;
	}

	const value = boardCode.value;
	const isImageArchive = value === 'IMAGE_ARCHIVE';
	const isVideoArchive = value === 'VIDEO_ARCHIVE';

	if (boardHelp) {
		if (isImageArchive) {
			boardHelp.textContent = 'Photography 목록에 등록됩니다. 메인 대표작 노출을 선택하면 메인 대표 Photography에도 표시됩니다.';
		}

		if (isVideoArchive) {
			boardHelp.textContent = 'Videography 목록에 등록됩니다. 메인 대표작 노출을 선택하면 메인 대표 Videography에도 표시됩니다.';
		}
	}

	if (thumbnailRow) {
		if (isVideoArchive) {
			thumbnailRow.style.display = 'none';

			if (thumbnailUrl) {
				thumbnailUrl.value = '';
			}
		} else {
			thumbnailRow.style.display = 'block';
		}
	}

	if (thumbnailHelp && isImageArchive) {
		thumbnailHelp.textContent = '비워두면 첫 번째 이미지 URL을 사용합니다.';
	}

	if (itemUrlsLabel) {
		itemUrlsLabel.textContent = isVideoArchive ? '유튜브 URL' : '이미지 URL';
	}

	if (itemUrlsHelp) {
		itemUrlsHelp.textContent = isVideoArchive ? '유튜브 링크를 한 줄에 하나씩 입력하세요. 썸네일 없이 영상이 바로 보입니다.' : '이미지 URL을 한 줄에 하나씩 입력하세요.';
	}
}

function getTextareaLines(id) {
	const element = document.getElementById(id);
	if (!element) { return []; }
	return element.value.split('\n').map(function(line) { return line.trim(); }).filter(function(line) { return line !== ''; });
}

function isYoutubeUrl(url) {
	return /youtu\.be|youtube\.com/.test(url || '');
}

function extractYoutubeId(url) {
	if (!url) { return ''; }

	const patterns = [/youtu\.be\/([^?&]+)/, /youtube\.com\/watch\?v=([^?&]+)/, /youtube\.com\/embed\/([^?&]+)/, /youtube\.com\/shorts\/([^?&]+)/];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) { return match[1]; }
	}

	return '';
}

function getCategoryName(categoryCode) {
	const categories = { 'performance': 'Performance', 'exhibition': 'Exhibition', 'festival-event': 'Festival / Event', 'interview': 'Interview' };
	return categories[categoryCode] || '';
}

function showMessage(id, message) {
	const element = document.getElementById(id);
	if (!element) { return; }
	element.textContent = message;
	element.style.display = 'block';
	setTimeout(function() { element.style.display = 'none'; }, 3500);
}

function showLoading() {
	const loading = document.getElementById('loading');
	if (loading) { loading.style.display = 'block'; }
}

function hideLoading() {
	const loading = document.getElementById('loading');
	if (loading) { loading.style.display = 'none'; }
}

function getValue(id) {
	const element = document.getElementById(id);
	return element ? element.value.trim() : '';
}

function setValue(id, value) {
	const element = document.getElementById(id);
	if (element) { element.value = value; }
}

function escapeHtml(value) {
	return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

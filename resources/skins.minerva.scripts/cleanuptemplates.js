( function ( M, $ ) {
	var AB = M.require( 'skins.minerva.scripts/AB' ),
		allIssues = {},
		KEYWORD_ALL_SECTIONS = 'all',
		config = mw.config,
		user = mw.user,
		ACTION_EDIT = config.get( 'wgAction' ) === 'edit',
		NS_MAIN = 0,
		NS_TALK = 1,
		NS_CATEGORY = 14,
		CURRENT_NS = config.get( 'wgNamespaceNumber' ),
		allPageIssuesSeverity,
		Icon = M.require( 'mobile.startup/Icon' ),
		pageIssueLogger = M.require( 'skins.minerva.scripts/pageIssueLogger' ),
		pageIssueParser = M.require( 'skins.minerva.scripts/pageIssueParser' ),
		CleanupOverlay = M.require( 'mobile.issues/CleanupOverlay' ),
		// setup ab test
		abTest = new AB( {
			testName: 'WME.PageIssuesAB',
			// Run AB only on article namespace, otherwise set samplingRate to 0,
			// forcing user into control (i.e. ignored/not logged) group.
			samplingRate: ( CURRENT_NS === NS_MAIN ) ? config.get( 'wgMinervaABSamplingRate', 0 ) : 0,
			sessionId: user.sessionId()
		} ),
		newTreatmentEnabled = abTest.isB();

	function isLoggingRequired( pageIssues ) {
		// No logging necessary when the A/B test is disabled (control group).
		return abTest.isEnabled() && pageIssues.length;
	}

	/**
	 * @param {PageIssue} issue
	 * @return {string}
	 */
	function formatPageIssuesSeverity( issue ) {
		return issue.severity;
	}
	/**
	 * Extract a summary message from a cleanup template generated element that is
	 * friendly for mobile display.
	 * @param {Object} $box element to extract the message from
	 * @ignore
	 * @typedef {Object} IssueSummary
	 * @prop {string} severity
	 * @prop {string} icon HTML string.
	 * @prop {string} text HTML string.
	 * @return {IssueSummary}
	 */
	function extractMessage( $box ) {
		var selector = '.mbox-text, .ambox-text',
			$container = $( '<div>' ),
			pageIssue;

		$box.find( selector ).each( function () {
			var contents,
				$this = $( this );
			// Clean up talk page boxes
			$this.find( 'table, .noprint' ).remove();
			contents = $this.html();

			if ( contents ) {
				$( '<p>' ).html( contents ).appendTo( $container );
			}
		} );

		pageIssue = pageIssueParser.parse( $box.get( 0 ) );

		return {
			severity: pageIssue.severity,
			icon: pageIssue.icon.toHtmlString(),
			text: $container.html()
		};
	}

	/**
	 * Create a link element that opens the issues overlay.
	 *
	 * @ignore
	 *
	 * @param {string} labelText The text value of the element
	 * @return {JQuery}
	 */
	function createLinkElement( labelText ) {
		return $( '<a class="cleanup mw-mf-cleanup"></a>' )
			.text( labelText );
	}

	/**
	 * Render a banner in a containing element.
	 * if in group B, a learn more link will be append to any amboxes inside $container
	 * if in group A or control, any amboxes in container will be removed and a link "page issues"
	 * will be rendered above the heading.
	 * This function comes with side effects. It will populate a global "allIssues" object which
	 * will link section numbers to issues.
	 * @param {JQuery.Object} $container to render the page issues banner inside.
	 * @param {string} labelText what the label of the page issues banner should say
	 * @param {number|string} section that the banner and its issues belong to.
	 *  If string KEYWORD_ALL_SECTIONS banner should apply to entire page.
	 * @param {boolean} inline - if true the first ambox in the section will become the entry point for the issues overlay
	 *  and if false, a link will be rendered under the heading.
	 * @param {OverlayManager} overlayManager
	 * @ignore
	 *
	 * @return {JQuery.Object}
	 */
	function createBanner( $container, labelText, section, inline, overlayManager ) {
		var $learnMore,
			issueUrl = section === KEYWORD_ALL_SECTIONS ? '#/issues/' + KEYWORD_ALL_SECTIONS : '#/issues/' + section,
			selector = 'table.ambox, table.tmbox, table.cmbox, table.fmbox',
			$metadata = $container.find( selector ),
			issues = [],
			$link,
			severity;

		// clean it up a little
		$metadata.find( '.NavFrame' ).remove();
		$metadata.each( function () {
			var issue,
				$this = $( this );

			if ( $this.find( selector ).length === 0 ) {
				issue = extractMessage( $this );
				// Some issues after "extractMessage" has been run will have no text.
				// For example in Template:Talk header the table will be removed and no issue found.
				// These should not be rendered.
				if ( issue.text ) {
					issues.push( issue );
				}
			}
		} );
		// store it for later
		allIssues[section] = issues;

		if ( $metadata.length && inline ) {
			severity = pageIssueParser.maxSeverity(
				issues.map( function ( issue ) { return issue.severity; } )
			);
			new Icon( {
				glyphPrefix: 'minerva',
				name: pageIssueParser.iconName( $metadata.get( 0 ), severity )
			} ).prependTo( $metadata.find( '.mbox-text' ) );
			$learnMore = $( '<span>' )
				.addClass( 'ambox-learn-more' )
				.text( mw.msg( 'skin-minerva-issue-learn-more' ) );
			if ( $( '.mw-collapsible-content' ).length ) {
				// e.g. Template:Multiple issues
				$learnMore.insertAfter( $metadata.find( '.mbox-text-span' ) );
			} else {
				// e.g. Template:merge from
				$learnMore.appendTo( $metadata.find( '.mbox-text' ) );
			}
			$metadata.click( function () {
				var pageIssue = pageIssueParser.parse( this );
				pageIssueLogger.log( {
					action: 'issueClicked',
					issuesSeverity: [ pageIssue.severity ]
				} );
				overlayManager.router.navigate( issueUrl );
				return false;
			} );
		} else {
			$link = createLinkElement( labelText );
			// In group B, we link to all issues no matter where the banner is.
			$link.attr( 'href', '#/issues/' + KEYWORD_ALL_SECTIONS );
			$link.click( function () {
				pageIssueLogger.log( {
					action: 'issueClicked',
					// empty array is passed for 'old' treatment.
					issuesSeverity: []
				} );
			} );
			if ( $metadata.length ) {
				$link.insertAfter( $( 'h1#section_0' ) );
				$metadata.remove();
			}
		}

		return $metadata;
	}

	/**
	 * Obtains the list of issues for the current page and provided section
	 * @param {number|string} section either KEYWORD_ALL_SECTIONS or a number relating to the section
	 *  the issues belong to
	 * @return {jQuery.Object[]} array of all issues.
	 */
	function getIssues( section ) {
		if ( section === KEYWORD_ALL_SECTIONS ) {
			// Note section.all may not exist, depending on the structure of the HTML page.
			// It will only exist when Minerva has been run in desktop mode.
			// If it's absent, we'll reduce all the other lists into one.
			return allIssues.all || Object.keys( allIssues ).reduce(
				function ( all, key ) {
					return all.concat( allIssues[key] );
				},
				[]
			);
		} else {
			return allIssues[section] || [];
		}
	}

	/**
	 * Obtain a suitable heading for the issues overlay based on the namespace
	 * @param {number} ns is the namespace to generate heading for
	 * @return {string} heading for overlay
	 */
	function getNamespaceHeadingText( ns ) {
		switch ( ns ) {
			case NS_CATEGORY:
				return mw.msg( 'mobile-frontend-meta-data-issues-categories' );
			case NS_TALK:
				return mw.msg( 'mobile-frontend-meta-data-issues-talk' );
			case NS_MAIN:
				return mw.msg( 'mobile-frontend-meta-data-issues' );
			default:
				return '';
		}
	}

	/**
	 * Scan an element for any known cleanup templates and replace them with a button
	 * that opens them in a mobile friendly overlay.
	 * @ignore
	 * @param {OverlayManager} overlayManager
	 * @param {Page} page
	 */
	function initPageIssues( overlayManager, page ) {
		var label,
			headingText = ACTION_EDIT ? mw.msg( 'edithelp' ) : getNamespaceHeadingText( CURRENT_NS ),
			$lead = page.getLeadSectionElement(),
			issueOverlayShowAll = CURRENT_NS === NS_CATEGORY || CURRENT_NS === NS_TALK || ACTION_EDIT || !$lead,
			inline = newTreatmentEnabled && CURRENT_NS === 0,
			$container = $( '#bodyContent' );

		// set A-B test class.
		$( 'html' ).addClass( newTreatmentEnabled ? 'issues-group-B' : 'issues-group-A' );

		if ( ACTION_EDIT ) {
			// Editor uses different parent element
			$container = $( '#mw-content-text' );
			createBanner( $container, mw.msg( 'edithelp' ), KEYWORD_ALL_SECTIONS, inline, overlayManager );
		} else if ( CURRENT_NS === NS_TALK || CURRENT_NS === NS_CATEGORY ) {
			// e.g. Template:English variant category; Template:WikiProject
			createBanner( $container, mw.msg( 'mobile-frontend-meta-data-issues-header-talk' ),
				KEYWORD_ALL_SECTIONS, inline, overlayManager );
		} else if ( CURRENT_NS === NS_MAIN ) {
			label = mw.msg( 'mobile-frontend-meta-data-issues-header' );
			if ( issueOverlayShowAll ) {
				createBanner( $container, label, KEYWORD_ALL_SECTIONS, inline, overlayManager );
			} else {
				// parse lead
				createBanner( $lead, label, 0, inline, overlayManager );
				if ( newTreatmentEnabled ) {
					// parse other sections but only in group B. In treatment A no issues are shown for sections.
					$lead.nextAll( 'h1,h2,h3,h4,h5,h6' ).each( function ( i, headingEl ) {
						var $headingEl = $( headingEl ),
							$section = $headingEl.next(),
							sectionNum = $headingEl.find( '.edit-page' ).data( 'section' );

						createBanner( $section, label, sectionNum, inline, overlayManager );
					} );
				}
			}
		}

		if ( isLoggingRequired( getIssues( KEYWORD_ALL_SECTIONS ) ) ) {
			// Enable logging.
			pageIssueLogger.subscribe(
				newTreatmentEnabled,
				pageIssueLogger.newPageIssueSchemaData(
					newTreatmentEnabled,
					CURRENT_NS,
					getIssues( KEYWORD_ALL_SECTIONS ).map( formatPageIssuesSeverity )
				)
			);
		}

		// Setup the overlay route.
		overlayManager.add( new RegExp( '^/issues/(\\d+|' + KEYWORD_ALL_SECTIONS + ')$' ), function ( section ) {
			var overlay = new CleanupOverlay( {
				issues: getIssues( section ),
				// Note only the main namespace is expected to make use of section issues, so the heading will always be
				// minerva-meta-data-issues-section-header regardless of namespace
				headingText: section === '0' || section === KEYWORD_ALL_SECTIONS ? headingText :
					mw.msg( 'minerva-meta-data-issues-section-header' )
			} );
			// Tracking overlay close event.
			overlay.on( 'Overlay-exit', function () {
				pageIssueLogger.log( {
					action: 'modalClose',
					issuesSeverity: getIssues( section ).map( formatPageIssuesSeverity )
				} );
			} );
			overlay.on( 'link-edit-click', function ( severity ) {
				pageIssueLogger.log( {
					action: 'modalEditClicked',
					issuesSeverity: [ severity ]
				} );
			} );
			overlay.on( 'link-internal-click', function ( severity ) {
				pageIssueLogger.log( {
					action: 'modalInternalClicked',
					issuesSeverity: [ severity ]
				} );
			} );
			return overlay;
		} );

		// Tracking pageLoaded event (technically, "issues" loaded).
		pageIssueLogger.log( {
			action: 'pageLoaded',
			issuesSeverity: allPageIssuesSeverity
		} );
	}

	M.define( 'skins.minerva.scripts/cleanuptemplates', {
		init: initPageIssues,
		// The logger requires initialization (subscription). Ideally, the logger would be initialized
		// and passed to initPageIssues() by the client. Since it's not, expose a log method and hide
		// the subscription call in cleanuptemplates.
		log: pageIssueLogger.log,
		test: {
			createBanner: createBanner
		}
	} );

}( mw.mobileFrontend, jQuery ) );

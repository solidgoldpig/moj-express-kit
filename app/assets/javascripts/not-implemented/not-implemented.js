jQuery(document).ready(function(){
  jQuery('.add-note, .schedule-reminder, .share-plan, nav .print, nav .share, nav .edit, .plan_step_by_step_submit button, .action-note-add button, .skipped-action').on('click', function(e){
    var $el = jQuery(this)
    var feature = $el.text() || $el.val()
    var $feature_dialog = jQuery('#feature_dialog')
    var $not_implemented = jQuery('#not_implemented')
    if (!$not_implemented.get(0)) {
      jQuery('body').append('<div id="feature_dialog"><div class="dialog-content"><p class="dialog-close">× Close</p><h2 id="not_implemented">Not implemented</h2><p id="not_implemented"></p><p>What would you expect this feature to do?</p></div></div>')
      $not_implemented = jQuery('#not_implemented')
      $feature_dialog = jQuery('#feature_dialog')
      $feature_dialog.on('click', function(){
        jQuery(this).hide()
      })
    }
    // $not_implemented.html('The “' + feature + '” feature has not been implemented yet')
    $not_implemented.html(feature)
    $feature_dialog.show()
    e.preventDefault()
  })
})